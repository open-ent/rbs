package net.atos.entng.rbs.service;

import fr.wseduc.webutils.Either;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;

import java.util.List;

/**
 * Affectation informative entre deux ressources (scénario BFC 1.3, étape 1 : ex. un
 * vidéoprojecteur mobile "habituellement" affecté à une ou plusieurs salles). N'impacte en rien
 * les réservations — cf. modules/rbs/src/main/resources/sql/018-resource-assignment.sql et la
 * mémoire rbs-affectation-materiel-mobile-salle (bundle de réservation explicitement différé).
 */
public interface ResourceAssignmentService {

	/**
	 * Liste les ressources affectées à la ressource donnée (dans les deux sens de la relation).
	 */
	void listForResource(long resourceId, Handler<Either<String, JsonArray>> handler);

	/**
	 * Liste les ressources candidates à une affectation pour un établissement donné (toutes les
	 * ressources de l'établissement, hors la ressource elle-même) — sert à peupler le sélecteur
	 * front, sans présumer côté serveur qui doit être affecté à qui (salle ↔ mobile ou l'inverse).
	 */
	void listCandidatesForStructure(String structureId, long excludeResourceId, Handler<Either<String, JsonArray>> handler);

	/**
	 * Remplace l'ensemble des affectations d'une ressource (delete puis insert en transaction) —
	 * pas d'ajout/retrait incrémental, le formulaire envoie toujours la liste complète souhaitée.
	 */
	void setAssignments(long resourceId, List<Long> assignedResourceIds, Handler<Either<String, JsonArray>> handler);
}
