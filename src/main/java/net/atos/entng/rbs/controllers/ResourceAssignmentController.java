package net.atos.entng.rbs.controllers;

import fr.wseduc.rs.ApiDoc;
import fr.wseduc.rs.Get;
import fr.wseduc.rs.Put;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.request.RequestUtils;
import io.vertx.core.eventbus.EventBus;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonArray;
import net.atos.entng.rbs.filters.TypeAndResourceAppendPolicy;
import net.atos.entng.rbs.service.ResourceAssignmentService;
import net.atos.entng.rbs.service.impl.ResourceAssignmentServiceSqlImpl;
import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.http.filter.ResourceFilter;

import java.util.ArrayList;
import java.util.List;

import static org.entcore.common.http.response.DefaultResponseHandler.arrayResponseHandler;

/**
 * Affectation informative entre deux ressources (scénario BFC 1.3, étape 1 : ex. un
 * vidéoprojecteur mobile "habituellement" affecté à une ou plusieurs salles). N'impacte en rien
 * les réservations — cf. modules/rbs/src/main/resources/sql/018-resource-assignment.sql et la
 * mémoire rbs-affectation-materiel-mobile-salle.
 */
public class ResourceAssignmentController extends ControllerHelper {

	private final ResourceAssignmentService assignmentService;

	public ResourceAssignmentController(EventBus eb) {
		this.assignmentService = new ResourceAssignmentServiceSqlImpl();
	}

	@Get("/resources/candidates/:schoolId/:excludeResourceId")
	@ApiDoc("List the resources of a structure that can be assigned to a given resource")
	@SecuredAction(value = "rbs.resource.assignment.list", type = ActionType.AUTHENTICATED)
	public void listCandidates(final HttpServerRequest request) {
		String schoolId = request.params().get("schoolId");
		try {
			long excludeResourceId = Long.parseLong(request.params().get("excludeResourceId"));
			assignmentService.listCandidatesForStructure(schoolId, excludeResourceId, arrayResponseHandler(request));
		} catch (NumberFormatException e) {
			badRequest(request, "invalid.id");
		}
	}

	@Get("/resource/:id/assignments")
	@ApiDoc("List the resources currently assigned to a resource")
	@SecuredAction(value = "rbs.resource.assignment.list", type = ActionType.AUTHENTICATED)
	public void listAssignments(final HttpServerRequest request) {
		try {
			long resourceId = Long.parseLong(request.params().get("id"));
			assignmentService.listForResource(resourceId, arrayResponseHandler(request));
		} catch (NumberFormatException e) {
			badRequest(request, "invalid.id");
		}
	}

	@Put("/resource/:id/assignments")
	@ApiDoc("Replace the list of resources assigned to a resource")
	@SecuredAction(value = "rbs.contrib", type = ActionType.RESOURCE)
	@ResourceFilter(TypeAndResourceAppendPolicy.class)
	public void setAssignments(final HttpServerRequest request) {
		try {
			final long resourceId = Long.parseLong(request.params().get("id"));
			RequestUtils.bodyToJson(request, pathPrefix + "setResourceAssignments", body -> {
				JsonArray idsArray = body.getJsonArray("resourceIds", new JsonArray());
				List<Long> resourceIds = new ArrayList<>();
				for (Object o : idsArray) {
					resourceIds.add(((Number) o).longValue());
				}
				assignmentService.setAssignments(resourceId, resourceIds, arrayResponseHandler(request));
			});
		} catch (NumberFormatException e) {
			badRequest(request, "invalid.id");
		}
	}
}
