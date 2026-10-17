package net.atos.entng.rbs.service.impl;

import fr.wseduc.webutils.Either;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import net.atos.entng.rbs.service.ResourceAssignmentService;
import org.entcore.common.sql.Sql;
import org.entcore.common.sql.SqlStatementsBuilder;

import java.util.List;

import static org.entcore.common.sql.SqlResult.validResultHandler;

public class ResourceAssignmentServiceSqlImpl implements ResourceAssignmentService {

	@Override
	public void listForResource(long resourceId, Handler<Either<String, JsonArray>> handler) {
		String query = "SELECT r.id, r.name, r.is_mobile FROM rbs.resource_assignment ra"
				+ " INNER JOIN rbs.resource r ON r.id = (CASE WHEN ra.resource_id_1 = ? THEN ra.resource_id_2 ELSE ra.resource_id_1 END)"
				+ " WHERE ra.resource_id_1 = ? OR ra.resource_id_2 = ? ORDER BY r.name";
		JsonArray values = new JsonArray().add(resourceId).add(resourceId).add(resourceId);
		Sql.getInstance().prepared(query, values, validResultHandler(handler));
	}

	@Override
	public void listCandidatesForStructure(String structureId, long excludeResourceId, Handler<Either<String, JsonArray>> handler) {
		// Seules les salles fixes (is_mobile = false) sont des candidates valides : le but de
		// l'affectation est d'indiquer DANS QUELLE SALLE se trouve habituellement un matériel
		// mobile, pas d'affecter un matériel mobile à un autre matériel mobile.
		String query = "SELECT r.id, r.name, r.is_mobile FROM rbs.resource r"
				+ " INNER JOIN rbs.resource_type t ON r.type_id = t.id"
				+ " WHERE t.school_id = ? AND r.id != ? AND r.is_mobile = false ORDER BY r.name";
		JsonArray values = new JsonArray().add(structureId).add(excludeResourceId);
		Sql.getInstance().prepared(query, values, validResultHandler(handler));
	}

	@Override
	public void setAssignments(long resourceId, List<Long> assignedResourceIds, Handler<Either<String, JsonArray>> handler) {
		SqlStatementsBuilder statementsBuilder = new SqlStatementsBuilder();
		statementsBuilder.prepared("DELETE FROM rbs.resource_assignment WHERE resource_id_1 = ? OR resource_id_2 = ?",
				new JsonArray().add(resourceId).add(resourceId));
		if (assignedResourceIds != null) {
			for (Long assignedId : assignedResourceIds) {
				if (assignedId == null || assignedId == resourceId) {
					continue;
				}
				long id1 = Math.min(resourceId, assignedId);
				long id2 = Math.max(resourceId, assignedId);
				statementsBuilder.prepared("INSERT INTO rbs.resource_assignment (resource_id_1, resource_id_2) VALUES (?, ?)"
						+ " ON CONFLICT (resource_id_1, resource_id_2) DO NOTHING",
						new JsonArray().add(id1).add(id2));
			}
		}
		// Nombre de statements variable selon assignedResourceIds.size() : on relit la liste
		// finale via un appel séparé plutôt que de viser un index de résultat dynamique.
		Sql.getInstance().transaction(statementsBuilder.build(), message -> {
			if (!"ok".equals(message.body().getString("status"))) {
				handler.handle(new Either.Left<>(message.body().getString("message", "rbs.resource.assignment.update.error")));
				return;
			}
			listForResource(resourceId, handler);
		});
	}
}
