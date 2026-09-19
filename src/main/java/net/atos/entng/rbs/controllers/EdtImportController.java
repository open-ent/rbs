package net.atos.entng.rbs.controllers;

import fr.wseduc.rs.ApiDoc;
import fr.wseduc.rs.Post;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.request.RequestUtils;
import io.vertx.core.eventbus.EventBus;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import net.atos.entng.rbs.BookingUtils;
import net.atos.entng.rbs.service.EdtImportService;
import net.atos.entng.rbs.service.impl.EdtImportServiceImpl;
import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.user.UserInfos;
import org.entcore.common.user.UserUtils;

/**
 * Génère les réservations RBS périodiques depuis les cours déjà publiés dans l'Emploi du temps
 * (scénario BFC 1.3, étape 5 : « traiter les besoins récurrents avant la rentrée »). Cf.
 * {@link EdtImportService}.
 */
public class EdtImportController extends ControllerHelper {

	private final EdtImportService edtImportService;

	public EdtImportController(EventBus eb) {
		this.edtImportService = new EdtImportServiceImpl(eb, new net.atos.entng.rbs.service.impl.BookingServiceSqlImpl());
	}

	/**
	 * Restreint à l'administrateur local de LA structure demandée (ou super-admin) : cette action
	 * crée des réservations sur potentiellement toutes les salles de l'établissement d'un coup,
	 * une portée plus large qu'un simple droit RESOURCE sur une ressource précise.
	 */
	@Post("/structures/:structureId/import-from-edt")
	@ApiDoc("Generate periodic RBS bookings from already-published EDT courses")
	@SecuredAction(value = "rbs.edtImport", type = ActionType.WORKFLOW)
	public void importFromEdt(final HttpServerRequest request) {
		final String structureId = request.params().get("structureId");
		UserUtils.getUserInfos(eb, request, user -> {
			if (user == null) {
				unauthorized(request);
				return;
			}
			if (!user.isADMC() && !BookingUtils.getLocalAdminScope(user).contains(structureId)) {
				unauthorized(request, "rbs.edtimport.forbidden");
				return;
			}
			RequestUtils.bodyToJson(request, pathPrefix + "importFromEdt", body -> {
				JsonArray groupIds = body.getJsonArray("groupIds", new JsonArray());
				String startAt = body.getString("startAt");
				String endAt = body.getString("endAt");
				Long periodicEndDate = body.getLong("periodicEndDate");
				boolean dryRun = body.getBoolean("dryRun", true);
				if (startAt == null || endAt == null || periodicEndDate == null) {
					badRequest(request, "rbs.edtimport.missing.dates");
					return;
				}
				edtImportService.importFromEdt(structureId, groupIds, startAt, endAt, periodicEndDate, dryRun, user,
						either -> {
							if (either.isRight()) {
								renderJson(request, either.right().getValue());
							} else {
								renderError(request, new JsonObject().put("error", either.left().getValue()));
							}
						});
			});
		});
	}
}
