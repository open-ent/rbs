-- Recensement des ressources (scénario BFC 1.3, étape 1) : capacité d'accueil, équipements
-- structurés, matériel mobile, besoin de clé — champs absents du modèle jusqu'ici (seuls
-- name/quantity/description/is_available/category existaient), constatés manquants lors de
-- l'audit du module contre le scénario "recenser les ressources" (salles + matériel).

-- Capacité d'accueil d'une salle (nombre de places), distincte de `quantity` qui compte le
-- nombre d'unités réservables simultanément de la MÊME ressource (ex. 3 vidéoprojecteurs
-- identiques), pas l'effectif qu'elle peut recevoir.
ALTER TABLE rbs.resource ADD COLUMN capacity INTEGER;

-- Distingue une ressource "matériel mobile" (chariot de tablettes, vidéoprojecteur mobile —
-- empruntable, sans lieu fixe) d'une salle physique fixe. Purement indicatif/filtrant côté IHM,
-- ne change aucune règle de réservation.
ALTER TABLE rbs.resource ADD COLUMN is_mobile BOOLEAN NOT NULL DEFAULT false;

-- Signale qu'emprunter/accéder à la ressource nécessite une clé (contrainte d'accès du
-- scénario). Purement indicatif, affiché au réservant.
ALTER TABLE rbs.resource ADD COLUMN requires_key BOOLEAN NOT NULL DEFAULT false;

-- Équipements fixes : catalogue par établissement (school_id, comme rbs.resource_type) plutôt
-- qu'un texte libre par ressource, pour rester filtrable/recherchable et éviter les doublons
-- de saisie ("vidéoprojecteur" / "Vidéo-projecteur" / ...).
CREATE TABLE rbs.equipment (
    id BIGSERIAL PRIMARY KEY,
    school_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    UNIQUE (school_id, name)
);

-- Association many-to-many : une ressource peut porter plusieurs équipements, un équipement
-- peut être partagé par plusieurs ressources (ex. "Vidéoprojecteur" présent dans plusieurs
-- salles).
CREATE TABLE rbs.resource_equipment (
    resource_id BIGINT NOT NULL REFERENCES rbs.resource(id) ON DELETE CASCADE,
    equipment_id BIGINT NOT NULL REFERENCES rbs.equipment(id) ON DELETE CASCADE,
    PRIMARY KEY (resource_id, equipment_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON rbs.equipment, rbs.resource_equipment TO "apps";
GRANT USAGE, SELECT, UPDATE ON rbs.equipment_id_seq TO "apps";
