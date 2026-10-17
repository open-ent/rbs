package net.atos.entng.rbs.service;

import fr.wseduc.webutils.Either;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.entcore.common.user.UserInfos;

/**
 * Génère les réservations RBS périodiques correspondant aux cours déjà publiés dans l'Emploi du
 * temps (scénario BFC 1.3, étape 5 : « traiter les besoins récurrents avant la rentrée »).
 * Remplace un script ponctuel utilisé manuellement lors d'une session précédente
 * (data-imports/rbs-from-edt/rbs_from_edt.js, hors de ce dépôt) par une vraie fonctionnalité du
 * module — jamais d'écrasement/duplication silencieux : les créneaux déjà couverts (même
 * ressource + même motif) sont ignorés, les vrais conflits (ressource déjà prise par quelqu'un
 * d'autre) sont remontés dans le rapport, jamais créés.
 */
public interface EdtImportService {

	/**
	 * @param structureId Structure Neo4j de l'établissement
	 * @param groupIds Classes/groupes à couvrir (vide = tout l'établissement, cf. get-courses côté EDT)
	 * @param startAt Début de la fenêtre de lecture des cours EDT (yyyy-MM-dd)
	 * @param endAt Fin de la fenêtre de lecture des cours EDT (yyyy-MM-dd) — une à deux semaines
	 *              suffisent pour capter tous les créneaux récurrents une fois chacun
	 * @param periodicEndDateSeconds Date de fin des réservations RBS créées (timestamp Unix, ex.
	 *              fin d'année scolaire) — indépendante de la fenêtre de lecture ci-dessus
	 * @param dryRun Si vrai, calcule le rapport sans rien créer (prévisualisation avant la rentrée)
	 */
	void importFromEdt(String structureId, JsonArray groupIds, String startAt, String endAt,
			long periodicEndDateSeconds, boolean dryRun, UserInfos user,
			Handler<Either<String, JsonObject>> handler);

}
