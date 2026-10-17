-- Catégorie fonctionnelle d'un type de ressource (salle), pour le matching salle/matière
-- (school-planner, puis EDT). Texte libre volontairement (pas un enum SQL/CHECK) : quelques
-- catégories usuelles sont suggérées côté IHM (GENERAL, GYMNASE, LABO, TECHNO, MUSIQUE, ARTS,
-- CDI — alignées sur fr.tech.openent.planner.service.RoomMatchingService) mais un établissement
-- doit pouvoir en saisir une nouvelle (ex. AMPHITHEATRE) sans migration.
ALTER TABLE rbs.resource_type ADD COLUMN category VARCHAR(40) NOT NULL DEFAULT 'GENERAL';
