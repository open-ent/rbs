-- Affectation informative entre deux ressources (ex. un vidéoprojecteur mobile "habituellement"
-- affecté à une ou plusieurs salles). N'impacte en rien les réservations : purement indicatif.
-- Relation non orientée, dédupliquée par la contrainte resource_id_1 < resource_id_2.
CREATE TABLE rbs.resource_assignment (
    resource_id_1 BIGINT NOT NULL REFERENCES rbs.resource(id) ON DELETE CASCADE,
    resource_id_2 BIGINT NOT NULL REFERENCES rbs.resource(id) ON DELETE CASCADE,
    PRIMARY KEY (resource_id_1, resource_id_2),
    CHECK (resource_id_1 < resource_id_2)
);

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON rbs.resource_assignment TO "apps";
