package net.atos.entng.rbs.controllers;

import fr.wseduc.bus.BusAddress;
import fr.wseduc.webutils.Either;
import io.vertx.core.eventbus.Message;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import net.atos.entng.rbs.core.constants.Field;
import net.atos.entng.rbs.models.Booking;
import net.atos.entng.rbs.models.Resource;
import net.atos.entng.rbs.service.BookingService;
import net.atos.entng.rbs.service.ResourceService;
import net.atos.entng.rbs.service.ResourceTypeService;
import org.entcore.common.bus.BusResponseHandler;
import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.user.UserUtils;

import java.util.List;
import java.util.stream.Collectors;

public class EventBusController extends ControllerHelper {

    private final BookingService bookingService;
    private final ResourceTypeService resourceTypeService;
    private final ResourceService resourceService;

    public EventBusController(BookingService bookingService, ResourceTypeService resourceTypeService,
                               ResourceService resourceService) {
        this.bookingService = bookingService;
        this.resourceTypeService = resourceTypeService;
        this.resourceService = resourceService;
    }

    /**
     * Handles the event bus
     * @param message {@link Message<JsonObject>} the information recieved
     */
    @BusAddress("net.atos.entng.rbs")
    public void bus(final Message<JsonObject> message) {
        JsonObject body = message.body();
        String action = body.getString(Field.ACTION);
        String userId = body.getString(Field.USERID);
        switch (action) {
            case "save-bookings":
                UserUtils.getUserInfos(eb, userId, user -> {
                    JsonArray bookingsArray = body.getJsonArray(Field.BOOKINGS);
                    List<Booking> bookings = bookingsArray
                            .stream()
                            .map((bookingObject) -> {
                                return new Booking(((JsonObject) bookingObject),
                                        new Resource(((JsonObject)bookingObject).getJsonObject(Field.RESOURCE, new JsonObject())));
                            })
                            .collect(Collectors.toList());
                    List<Integer> resourceIds = bookingsArray.stream()
                            .map((booking) -> ((JsonObject)booking).getJsonObject(Field.RESOURCE, new JsonObject()).getInteger(Field.ID, null))
                            .collect(Collectors.toList());

                    bookingService.createBookings(resourceIds, bookings, user)
                        .onSuccess((res) -> BusResponseHandler.busArrayHandler(message).handle(new Either.Right<>(res)))
                        .onFailure((err) -> BusResponseHandler.busArrayHandler(message).handle(new Either.Left<>(err.getMessage())));
                });

                break;
            case "delete-bookings":
                UserUtils.getUserInfos(eb, userId, user -> {
                    List<Integer> bookings = body.getJsonArray(Field.BOOKINGS).getList();
                    bookingService.checkRightsAndDeleteBookings(bookings, user)
                        .onSuccess((res) -> BusResponseHandler.busArrayHandler(message).handle(new Either.Right<>(new JsonArray(res))))
                        .onFailure((err) -> BusResponseHandler.busArrayHandler(message).handle(new Either.Left<>(err.getMessage())));
                });

                break;
            case "list-resources":
                // Lecture non filtrée par droits RBS — appel interne de module à module (EDT,
                // cahier de texte…) pour peupler un sélecteur de salle/ressource accessible à
                // n'importe quel enseignant, même sans droit RBS individuel.
                // Nouveau contrat de bus dédié (pas la route HTTP) : la clé est "structureId"
                // (camelCase), pas Field.STRUCTUREID ("structureid") qui sert au param HTTP —
                // MultiMap de query params insensible à la casse, JsonObject non.
                String structureId = body.getString("structureId");
                resourceTypeService.listAllForStructure(structureId, typesEvent -> {
                    if (typesEvent.isLeft()) {
                        message.reply(new JsonObject()
                                .put("status", "error")
                                .put("message", typesEvent.left().getValue()));
                        return;
                    }
                    JsonArray types = typesEvent.right().getValue();
                    if (types.isEmpty()) {
                        message.reply(new JsonObject()
                                .put("status", "ok")
                                .put("types", new JsonArray())
                                .put("resources", new JsonArray()));
                        return;
                    }
                    JsonArray allResources = new JsonArray();
                    int[] remaining = { types.size() };
                    for (Object typeObj : types) {
                        String typeId = String.valueOf(((JsonObject) typeObj).getInteger(Field.ID));
                        resourceService.listResources(null, null, typeId, resourcesEvent -> {
                            if (resourcesEvent.isRight()) {
                                allResources.addAll(resourcesEvent.right().getValue());
                            }
                            remaining[0]--;
                            if (remaining[0] == 0) {
                                message.reply(new JsonObject()
                                        .put("status", "ok")
                                        .put("types", types)
                                        .put("resources", allResources));
                            }
                        });
                    }
                });

                break;
            default:
                message.reply(new JsonObject()
                        .put("status", "error")
                        .put("message", "Invalid action."));
        }
    }

}