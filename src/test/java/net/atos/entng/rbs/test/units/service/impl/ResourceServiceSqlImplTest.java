package net.atos.entng.rbs.test.units.service.impl;

import io.vertx.core.Vertx;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.unit.Async;
import io.vertx.ext.unit.TestContext;
import io.vertx.ext.unit.junit.VertxUnitRunner;
import net.atos.entng.rbs.service.impl.ResourceServiceSqlImpl;
import org.entcore.common.sql.Sql;
import org.entcore.common.user.DefaultFunctions;
import org.entcore.common.user.UserInfos;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mockito;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RunWith(VertxUnitRunner.class)
public class ResourceServiceSqlImplTest {

    /**
     * Préfixe SELECT … FROM … JOIN produit par {@link ResourceServiceSqlImpl#listResources},
     * repris tel quel pour que les attendus ne décrivent que la clause WHERE propre à chaque cas.
     * Les sous-requêtes `equipment` et `assigned_resources` font partie de la requête depuis
     * l'ajout des équipements et des ressources associées.
     */
    private static final String SELECT_FROM =
            "SELECT r.*," +
                    " json_agg(row_to_json(row(rs.member_id,rs.action)::rbs.share_tuple)) as shared," +
                    " array_to_json(array_agg(m.group_id)) as groups," +
                    " (SELECT json_agg(json_build_object('id', e.id, 'name', e.name) ORDER BY e.name)" +
                    "  FROM rbs.resource_equipment re INNER JOIN rbs.equipment e ON re.equipment_id = e.id" +
                    "  WHERE re.resource_id = r.id) as equipment," +
                    " (SELECT json_agg(json_build_object('id', ar.id, 'name', ar.name) ORDER BY ar.name)" +
                    "  FROM rbs.resource_assignment ra INNER JOIN rbs.resource ar" +
                    "   ON ar.id = (CASE WHEN ra.resource_id_1 = r.id THEN ra.resource_id_2 ELSE ra.resource_id_1 END)" +
                    "  WHERE ra.resource_id_1 = r.id OR ra.resource_id_2 = r.id) as assigned_resources " +
                    " FROM rbs.resource AS r" +
                    " INNER JOIN rbs.resource_type AS t ON r.type_id = t.id" +
                    " LEFT JOIN rbs.resource_shares AS rs ON r.id = rs.resource_id" +
                    " LEFT JOIN rbs.resource_type_shares AS ts ON t.id = ts.resource_id" +
                    " LEFT JOIN rbs.members AS m ON (rs.member_id = m.id AND m.group_id IS NOT NULL)";

    private static final String GROUP_ORDER = " GROUP BY r.id ORDER BY r.name";

    private ResourceServiceSqlImpl resourceServiceSqlImpl;
    private Vertx vertx;

    @Before
    public void setUp() {
        this.vertx = Vertx.vertx();
        this.resourceServiceSqlImpl = Mockito.spy(new ResourceServiceSqlImpl());
        Sql.getInstance().init(vertx.eventBus(), "fr.openent.rbs");
    }

    @Test
    public void testListResources(TestContext ctx) {
        Async async = ctx.async();
        List<String> groupsAndUserIds = Arrays.asList("groupsAndUserId1", "groupsAndUserId2");
        UserInfos userInfos = new UserInfos();
        userInfos.setUserId("userId");
        UserInfos.Function function = new UserInfos.Function();
        List<String> list = Arrays.asList("schoolId1", "schoolId2");
        function.setScope(list);
        Map<String, UserInfos.Function> map = new HashMap<>();
        map.put(DefaultFunctions.ADMIN_LOCAL, function);
        userInfos.setFunctions(map);


        List<String> expectedQuery = Arrays.asList(
                SELECT_FROM + " WHERE r.type_id = ? " + GROUP_ORDER,
                SELECT_FROM + " WHERE rs.member_id IN (?,?) OR r.owner = ? " +
                        " OR ts.member_id IN (?,?) OR t.owner = ? OR t.school_id IN (?,?)" + GROUP_ORDER,
                SELECT_FROM + GROUP_ORDER
        );
        List<JsonArray> expectedParams = Arrays.asList(
                new JsonArray(Arrays.asList("resourceTypeId")),
                new JsonArray(Arrays.asList("groupsAndUserId1","groupsAndUserId2","userId","groupsAndUserId1","groupsAndUserId2","userId","schoolId1","schoolId2")),
                new JsonArray(Arrays.asList())
        );

        final Integer[] i = {0};
        vertx.eventBus().consumer("fr.openent.rbs", message -> {
            JsonObject body = (JsonObject) message.body();
            ctx.assertEquals("prepared", body.getString("action"));
            ctx.assertEquals(expectedQuery.get(i[0]), body.getString("statement"));
            ctx.assertEquals(expectedParams.get(i[0]).toString(), body.getJsonArray("values").toString());
            i[0]++;
            if (i[0] == expectedQuery.size()) {
                async.complete();
            }
        });


        this.resourceServiceSqlImpl.listResources(groupsAndUserIds, userInfos, "resourceTypeId", null);
        this.resourceServiceSqlImpl.listResources(groupsAndUserIds, userInfos, null, null);
        this.resourceServiceSqlImpl.listResources(null, userInfos, null, null);

        Mockito.doNothing().when(resourceServiceSqlImpl).listResources(Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any());
        userInfos = new UserInfos();
        groupsAndUserIds = Arrays.asList("groupsAndUserId1", "groupsAndUserId2");
        this.resourceServiceSqlImpl.listResources(groupsAndUserIds, userInfos, null);
        Mockito.verify(resourceServiceSqlImpl, Mockito.times(1)).listResources(groupsAndUserIds, userInfos, null, null);
    }

    @Test
    public void checkListResourcesNullThirdArgument(TestContext ctx) {
        Async async = ctx.async();
        List<String> groupsAndUserIds = Arrays.asList("groupsAndUserId1", "groupsAndUserId2");
        UserInfos userInfos = new UserInfos();
        userInfos.setUserId("userId");

        String expectedQuery = SELECT_FROM +
                " WHERE rs.member_id IN (?,?) OR r.owner = ? " +
                " OR ts.member_id IN (?,?) OR t.owner = ?" + GROUP_ORDER;

        JsonArray expectedParams = new JsonArray(Arrays.asList(
                "groupsAndUserId1",
                "groupsAndUserId2",
                "userId",
                "groupsAndUserId1",
                "groupsAndUserId2",
                "userId"
        ));

        vertx.eventBus().consumer("fr.openent.rbs", message -> {
            JsonObject body = (JsonObject) message.body();
            ctx.assertEquals("prepared", body.getString("action"));
            ctx.assertEquals(expectedQuery, body.getString("statement"));
            ctx.assertEquals(expectedParams.toString(), body.getJsonArray("values").toString());
            async.complete();
        });

        this.resourceServiceSqlImpl.listResources(groupsAndUserIds, userInfos, null, event -> {});
    }

    @Test
    public void checkListResourcesDefinedThirdArgument(TestContext ctx) {
        Async async = ctx.async();
        List<String> groupsAndUserIds = Arrays.asList("groupsAndUserId1", "groupsAndUserId2");
        UserInfos userInfos = new UserInfos();
        userInfos.setUserId("userId");
        String typeId = "typeId";

        String expectedQuery = SELECT_FROM + " WHERE r.type_id = ? " + GROUP_ORDER;

        JsonArray expectedParams = new JsonArray(Arrays.asList(typeId));

        vertx.eventBus().consumer("fr.openent.rbs", message -> {
            JsonObject body = (JsonObject) message.body();
            ctx.assertEquals("prepared", body.getString("action"));
            ctx.assertEquals(expectedQuery, body.getString("statement"));
            ctx.assertEquals(expectedParams.toString(), body.getJsonArray("values").toString());
            async.complete();
        });

        this.resourceServiceSqlImpl.listResources(groupsAndUserIds, userInfos, typeId, event -> {});
    }
}
