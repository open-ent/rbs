/*
 * Copyright © Région Nord Pas de Calais-Picardie,  Département 91, Région Aquitaine-Limousin-Poitou-Charentes, 2016.
 *
 * This file is part of OPEN ENT NG. OPEN ENT NG is a versatile ENT Project based on the JVM and ENT Core Project.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation (version 3 of the License).
 *
 * For the sake of explanation, any module that communicate over native
 * Web protocols, such as HTTP, with OPEN ENT NG is outside the scope of this
 * license and could be license under its own terms. This is merely considered
 * normal use of OPEN ENT NG, and does not fall under the heading of "covered work".
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

package net.atos.entng.rbs.controllers;

import java.util.Map;

import io.vertx.core.Future;
import io.vertx.core.Promise;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.entcore.common.neo4j.Neo4j;
import org.entcore.common.user.UserUtils;
import net.atos.entng.rbs.Rbs;

import org.entcore.common.events.EventStore;
import org.entcore.common.events.EventStoreFactory;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServerRequest;
import org.vertx.java.core.http.RouteMatcher;


import fr.wseduc.rs.Get;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.http.BaseController;

public class DisplayController extends BaseController {

	private EventStore eventStore;
	private enum RbsEvent { ACCESS }

	/** IHM par défaut : "react" (nouvelle) ou "angular" (ancienne), pilotée par la conf `frontend-ui`
	 *  (bloc du module dans ent-core.yaml, alimentée par FRONTEND_UI_DEFAULT).
	 *  Défaut "react" : la migration React (CCTP 51C) a la parité fonctionnelle (réservations
	 *  simple/périodique, modération, CRUD types/ressources, disponibilités, partage, export, agenda).
	 *  NB : launcher-next conserve la clé `frontend-ui` (bloc `config:` stocké verbatim) ; le fallback
	 *  Java "react" ne s'applique que si la conf est absente. Repli/override par `?ui=react|angular`. */
	private String frontendUi = "react";

	@Override
	public void init(Vertx vertx, JsonObject config, RouteMatcher rm,
					 Map<String, fr.wseduc.webutils.security.SecuredAction> securedActions) {
		super.init(vertx, config, rm, securedActions);
		this.frontendUi = "angular".equals(config.getString("frontend-ui", "react")) ? "angular" : "react";
		eventStore = EventStoreFactory.getFactory().getEventStore(Rbs.class.getSimpleName());
	}

	/** Clé de préférence usager portant le choix d'IHM (`{"ui":"react"}`) : lue par preferredUi(), posée par la page
	 *  « Paramètres du compte » du dashboard. Sans tiret ni point : entcore retire les caractères non alphanumériques. */
	private static final String UI_PREFERENCE = "rbsUi";

	@Get("")
	@SecuredAction("rbs.view")
	public void view(final HttpServerRequest request) {
		// Choix de l'IHM (CCTP 51C — migration React), par ordre de priorité décroissante :
		//   1. `?ui=react|angular` — dérogation ponctuelle, NON mémorisée ;
		//   2. la préférence de l'usager (clé `rbsUi`), posée dans les paramètres du compte ;
		//   3. la conf `frontend-ui` du module (FRONTEND_UI_DEFAULT).
		// rbs-react.html = nouvelle IHM ; rbs.html = ancienne IHM AngularJS.
		final String uiParam = request.getParam("ui");
		final String forced = ("react".equals(uiParam) || "angular".equals(uiParam)) ? uiParam : null;
		UserUtils.getUserInfos(eb, request, user -> {
			if (user == null) {
				unauthorized(request);
				return;
			}
			preferredUi(user.getUserId(), forced).onSuccess(ui -> {
				renderView(request, new io.vertx.core.json.JsonObject(), "react".equals(ui) ? "rbs-react.html" : "rbs.html", null);
				// Create event "access to application Rbs" and store it, for module "statistics"
				eventStore.createAndStoreEvent(RbsEvent.ACCESS.name(), request);
			});
		});
	}

	/** IHM à servir : la dérogation d'URL, sinon le choix de l'usager (lu dans le graphe, là où l'écrit
	 *  {@code PUT /userbook/preference/rbsUi}), sinon celui de la plateforme. Une lecture en échec ne bloque jamais
	 *  l'affichage : la plateforme tranche. */
	private Future<String> preferredUi(String userId, String forced) {
		if (forced != null) return Future.succeededFuture(forced);
		final Promise<String> promise = Promise.promise();
		final String query = "MATCH (:User {id:$userId})-[:PREFERS]->(uac:UserAppConf) RETURN uac." + UI_PREFERENCE + " AS preference";
		Neo4j.getInstance().execute(query, new JsonObject().put("userId", userId), message -> promise.complete(readUi(message.body())));
		return promise.future();
	}

	/** Extrait le choix d'IHM du résultat Neo4j — la préférence y est rangée en CHAÎNE JSON. */
	private String readUi(JsonObject body) {
		try {
			final JsonArray rows = body.getJsonArray("result", new JsonArray());
			if (rows.isEmpty()) return frontendUi;
			final String raw = rows.getJsonObject(0).getString("preference");
			if (raw == null || raw.trim().isEmpty()) return frontendUi;
			final String ui = new JsonObject(raw).getString("ui");
			return ("react".equals(ui) || "angular".equals(ui)) ? ui : frontendUi;
		} catch (Exception e) {
			// Préférence illisible ou graphe en échec : jamais d'erreur pour un choix d'habillage.
			return frontendUi;
		}
	}
}
