package net.atos.entng.rbs.service.impl;

import fr.wseduc.webutils.Either;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import net.atos.entng.rbs.service.EquipmentService;
import org.entcore.common.sql.Sql;
import org.entcore.common.sql.SqlStatementsBuilder;

import java.util.List;

import static org.entcore.common.sql.SqlResult.validResultHandler;
import static org.entcore.common.sql.SqlResult.validUniqueResultHandler;

public class EquipmentServiceSqlImpl implements EquipmentService {

	@Override
	public void listForStructure(String structureId, Handler<Either<String, JsonArray>> handler) {
		String query = "SELECT id, name FROM rbs.equipment WHERE school_id = ? ORDER BY name";
		Sql.getInstance().prepared(query, new JsonArray().add(structureId), validResultHandler(handler));
	}

	@Override
	public void create(String structureId, String name, Handler<Either<String, JsonObject>> handler) {
		// Upsert par (school_id, name) : un établissement qui saisit un équipement déjà présent
		// dans son catalogue récupère l'existant plutôt qu'une erreur de contrainte unique.
		String query = "INSERT INTO rbs.equipment (school_id, name) VALUES (?, ?)"
				+ " ON CONFLICT (school_id, name) DO UPDATE SET name = EXCLUDED.name"
				+ " RETURNING id, name";
		JsonArray values = new JsonArray().add(structureId).add(name);
		Sql.getInstance().prepared(query, values, validUniqueResultHandler(handler));
	}

	@Override
	public void delete(long equipmentId, Handler<Either<String, JsonObject>> handler) {
		String query = "DELETE FROM rbs.equipment WHERE id = ? RETURNING id";
		Sql.getInstance().prepared(query, new JsonArray().add(equipmentId), validUniqueResultHandler(handler));
	}

	@Override
	public void setResourceEquipment(long resourceId, List<Long> equipmentIds, Handler<Either<String, JsonArray>> handler) {
		SqlStatementsBuilder statementsBuilder = new SqlStatementsBuilder();
		statementsBuilder.prepared("DELETE FROM rbs.resource_equipment WHERE resource_id = ?",
				new JsonArray().add(resourceId));
		if (equipmentIds != null) {
			for (Long equipmentId : equipmentIds) {
				statementsBuilder.prepared("INSERT INTO rbs.resource_equipment (resource_id, equipment_id) VALUES (?, ?)",
						new JsonArray().add(resourceId).add(equipmentId));
			}
		}
		// Nombre de statements variable selon equipmentIds.size() : on relit la liste finale via
		// un appel séparé plutôt que de viser un index de résultat dynamique dans la transaction.
		Sql.getInstance().transaction(statementsBuilder.build(), message -> {
			if (!"ok".equals(message.body().getString("status"))) {
				handler.handle(new Either.Left<>(message.body().getString("message", "rbs.equipment.update.error")));
				return;
			}
			listForResource(resourceId, handler);
		});
	}

	private void listForResource(long resourceId, Handler<Either<String, JsonArray>> handler) {
		String query = "SELECT e.id, e.name FROM rbs.resource_equipment re"
				+ " INNER JOIN rbs.equipment e ON re.equipment_id = e.id"
				+ " WHERE re.resource_id = ? ORDER BY e.name";
		Sql.getInstance().prepared(query, new JsonArray().add(resourceId), validResultHandler(handler));
	}
}
