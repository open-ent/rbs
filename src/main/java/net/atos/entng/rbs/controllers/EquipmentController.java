package net.atos.entng.rbs.controllers;

import fr.wseduc.rs.ApiDoc;
import fr.wseduc.rs.Delete;
import fr.wseduc.rs.Get;
import fr.wseduc.rs.Post;
import fr.wseduc.rs.Put;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.request.RequestUtils;
import io.vertx.core.eventbus.EventBus;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import net.atos.entng.rbs.service.EquipmentService;
import net.atos.entng.rbs.service.impl.EquipmentServiceSqlImpl;
import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.http.filter.ResourceFilter;
import org.entcore.common.user.UserUtils;

import java.util.ArrayList;
import java.util.List;

import static org.entcore.common.http.response.DefaultResponseHandler.arrayResponseHandler;
import static org.entcore.common.http.response.DefaultResponseHandler.defaultResponseHandler;
import static org.entcore.common.http.response.DefaultResponseHandler.notEmptyResponseHandler;

/**
 * Catalogue d'équipements par établissement (scénario BFC 1.3, étape 1 : équipements fixes
 * attachés à une salle, cf. modules/rbs/src/main/resources/sql/017-resource-capacity-equipment-mobile-key.sql).
 * Mêmes droits que la gestion des types de ressource (rbs.type.manage/create) : le catalogue
 * d'équipements est une donnée d'administration RBS au même titre que les types de salle.
 */
public class EquipmentController extends ControllerHelper {

	private final EquipmentService equipmentService;

	public EquipmentController(EventBus eb) {
		this.equipmentService = new EquipmentServiceSqlImpl();
	}

	@Get("/equipments/:schoolId")
	@ApiDoc("List the equipment catalog of a structure")
	@SecuredAction(value = "rbs.equipment.list", type = ActionType.AUTHENTICATED)
	public void listEquipments(final HttpServerRequest request) {
		String schoolId = request.params().get("schoolId");
		equipmentService.listForStructure(schoolId, arrayResponseHandler(request));
	}

	@Post("/equipment")
	@ApiDoc("Add an equipment to a structure's catalog")
	@SecuredAction("rbs.type.create")
	public void createEquipment(final HttpServerRequest request) {
		UserUtils.getUserInfos(eb, request, user -> {
			if (user == null) {
				unauthorized(request);
				return;
			}
			RequestUtils.bodyToJson(request, pathPrefix + "createEquipment", body -> {
				String schoolId = body.getString("school_id");
				String name = body.getString("name");
				if (schoolId == null || schoolId.trim().isEmpty() || name == null || name.trim().isEmpty()) {
					badRequest(request, "invalid.equipment");
					return;
				}
				equipmentService.create(schoolId, name.trim(), notEmptyResponseHandler(request));
			});
		});
	}

	@Delete("/equipment/:id")
	@ApiDoc("Delete an equipment from a structure's catalog")
	@SecuredAction("rbs.type.manage")
	public void deleteEquipment(final HttpServerRequest request) {
		try {
			long id = Long.parseLong(request.params().get("id"));
			equipmentService.delete(id, defaultResponseHandler(request));
		} catch (NumberFormatException e) {
			badRequest(request, "invalid.id");
		}
	}

	@Put("/resource/:id/equipment")
	@ApiDoc("Replace the equipment list associated to a resource")
	@SecuredAction(value = "rbs.contrib", type = ActionType.RESOURCE)
	@ResourceFilter(net.atos.entng.rbs.filters.TypeAndResourceAppendPolicy.class)
	public void setResourceEquipment(final HttpServerRequest request) {
		try {
			final long resourceId = Long.parseLong(request.params().get("id"));
			RequestUtils.bodyToJson(request, pathPrefix + "setResourceEquipment", body -> {
				JsonArray idsArray = body.getJsonArray("equipmentIds", new JsonArray());
				List<Long> equipmentIds = new ArrayList<>();
				for (Object o : idsArray) {
					equipmentIds.add(((Number) o).longValue());
				}
				equipmentService.setResourceEquipment(resourceId, equipmentIds, arrayResponseHandler(request));
			});
		} catch (NumberFormatException e) {
			badRequest(request, "invalid.id");
		}
	}
}
