package net.atos.entng.rbs.service;

import fr.wseduc.webutils.Either;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

import java.util.List;

/**
 * Catalogue d'équipements par établissement (scénario BFC 1.3, étape 1 : équipements fixes
 * attachés à une salle). Réutilisable par plusieurs ressources — cf. modules/rbs/src/main/resources/sql/017-resource-capacity-equipment-mobile-key.sql.
 */
public interface EquipmentService {

	/**
	 * Liste le catalogue d'équipements d'un établissement.
	 */
	void listForStructure(String structureId, Handler<Either<String, JsonArray>> handler);

	/**
	 * Ajoute un équipement au catalogue d'un établissement (upsert par nom : renvoie
	 * l'équipement existant si le nom existe déjà pour cet établissement, plutôt qu'une erreur
	 * de doublon).
	 */
	void create(String structureId, String name, Handler<Either<String, JsonObject>> handler);

	/**
	 * Supprime un équipement du catalogue (retire aussi ses associations aux ressources, cf.
	 * ON DELETE CASCADE sur rbs.resource_equipment).
	 */
	void delete(long equipmentId, Handler<Either<String, JsonObject>> handler);

	/**
	 * Remplace l'ensemble des équipements associés à une ressource (delete puis insert en
	 * transaction) — pas d'ajout/retrait incrémental, le formulaire envoie toujours la liste
	 * complète souhaitée.
	 */
	void setResourceEquipment(long resourceId, List<Long> equipmentIds, Handler<Either<String, JsonArray>> handler);
}
