package net.atos.entng.rbs.service.impl;

import fr.wseduc.webutils.Either;
import io.vertx.core.Handler;
import io.vertx.core.eventbus.DeliveryOptions;
import io.vertx.core.eventbus.EventBus;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import net.atos.entng.rbs.BookingUtils;
import net.atos.entng.rbs.models.Booking;
import net.atos.entng.rbs.models.Slots;
import net.atos.entng.rbs.service.BookingService;
import net.atos.entng.rbs.service.EdtImportService;
import org.entcore.common.sql.Sql;
import org.entcore.common.sql.SqlResult;
import org.entcore.common.user.UserInfos;

import java.time.DayOfWeek;
import java.time.ZoneId;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

import static net.atos.entng.rbs.BookingStatus.REFUSED;

/**
 * Cf. {@link EdtImportService}. Regroupe les occurrences de cours EDT par créneau récurrent
 * (jour de semaine + heure de début/fin + salle + enseignant + matière + classe/groupe), puis crée
 * une réservation RBS périodique par créneau — en ignorant les créneaux déjà couverts (même
 * ressource + même motif) et en remontant les vrais conflits (ressource déjà prise par un tiers)
 * sans jamais les écraser.
 */
public class EdtImportServiceImpl implements EdtImportService {

	private final EventBus eb;
	private final BookingService bookingService;

	private static final DateTimeFormatter EDT_DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
	// Format français pour toute date affichée à l'utilisateur (jamais l'ISO "yyyy-MM-dd" par défaut
	// de LocalDate.toString()).
	private static final DateTimeFormatter FRENCH_DATE_FORMAT = DateTimeFormatter.ofPattern("dd-MM-yyyy");

	/**
	 * Le stockage Mongo brut des cours utilise 'T' comme séparateur date/heure (ISO), mais le
	 * service getCourses() exposé par EDT (fr.cgi.edt) le reformate au passage avec un espace
	 * ("yyyy-MM-dd HH:mm:ss") — constaté en dev, pas documenté. On normalise ici plutôt que de
	 * dépendre d'une convention non garantie.
	 */
	private static final Map<DayOfWeek, String> FRENCH_DAY_LABELS = new EnumMap<>(DayOfWeek.class);
	static {
		FRENCH_DAY_LABELS.put(DayOfWeek.MONDAY, "lundi");
		FRENCH_DAY_LABELS.put(DayOfWeek.TUESDAY, "mardi");
		FRENCH_DAY_LABELS.put(DayOfWeek.WEDNESDAY, "mercredi");
		FRENCH_DAY_LABELS.put(DayOfWeek.THURSDAY, "jeudi");
		FRENCH_DAY_LABELS.put(DayOfWeek.FRIDAY, "vendredi");
		FRENCH_DAY_LABELS.put(DayOfWeek.SATURDAY, "samedi");
		FRENCH_DAY_LABELS.put(DayOfWeek.SUNDAY, "dimanche");
	}

	private static String frenchDayLabel(DayOfWeek day) {
		return FRENCH_DAY_LABELS.getOrDefault(day, day.toString());
	}

	private static LocalDateTime parseEdtDate(String date) {
		String normalized = date.length() > 10 && date.charAt(10) == ' '
				? date.substring(0, 10) + "T" + date.substring(11)
				: date;
		return LocalDateTime.parse(normalized, EDT_DATE_FORMAT);
	}

	public EdtImportServiceImpl(EventBus eb, BookingService bookingService) {
		this.eb = eb;
		this.bookingService = bookingService;
	}

	@Override
	public void importFromEdt(String structureId, JsonArray groupIds, String startAt, String endAt,
			long periodicEndDateSeconds, boolean dryRun, UserInfos user,
			Handler<Either<String, JsonObject>> handler) {
		JsonObject request = new JsonObject()
				.put("action", "get-courses")
				.put("structureId", structureId)
				.put("startDate", startAt)
				.put("endDate", endAt)
				.put("groupIds", groupIds != null ? groupIds : new JsonArray());

		eb.request("fr.cgi.edt", request, new DeliveryOptions().setSendTimeout(30000), reply -> {
			if (reply.failed()) {
				handler.handle(new Either.Left<>("rbs.edtimport.eventbus.error: " + reply.cause().getMessage()));
				return;
			}
			JsonObject body = (JsonObject) reply.result().body();
			if (!"ok".equals(body.getString("status"))) {
				handler.handle(new Either.Left<>("rbs.edtimport.edt.error: " + body.getString("message", "unknown")));
				return;
			}
			JsonArray courses = body.getJsonArray("result", new JsonArray());
			Map<String, List<JsonObject>> grouped = groupCoursesBySlot(courses);
			if (grouped.isEmpty()) {
				handler.handle(new Either.Right<>(new JsonObject()
						.put("created", new JsonArray())
						.put("skippedExisting", new JsonArray())
						.put("conflicts", new JsonArray())
						.put("unmatchedRooms", new JsonArray())
						.put("obsolete", new JsonArray())));
				return;
			}
			resolveRoomsAndImport(structureId, grouped, periodicEndDateSeconds, dryRun, user, handler);
		});
	}

	/**
	 * Clé de regroupement : un même créneau hebdomadaire récurrent. La salle est incluse dans la
	 * clé (via roomLabels, résolue en resource_id ensuite) — si un cours change de salle en cours
	 * d'année sur le même horaire, ce sont deux créneaux distincts, pas une anomalie à fusionner.
	 */
	private Map<String, List<JsonObject>> groupCoursesBySlot(JsonArray courses) {
		Map<String, List<JsonObject>> grouped = new LinkedHashMap<>();
		for (Object o : courses) {
			JsonObject course = (JsonObject) o;
			String startDate = course.getString("startDate");
			String endDate = course.getString("endDate");
			JsonArray roomLabels = course.getJsonArray("roomLabels", new JsonArray());
			if (startDate == null || endDate == null || roomLabels.isEmpty()) {
				continue; // pas de salle assignée : rien à réserver dans RBS
			}
			LocalDateTime start = parseEdtDate(startDate);
			LocalDateTime end = parseEdtDate(endDate);
			String roomLabel = roomLabels.getString(0);
			String key = start.getDayOfWeek() + "|" + start.toLocalTime() + "|" + end.toLocalTime() + "|"
					+ roomLabel + "|" + course.getValue("subjectId") + "|" + course.getJsonArray("teacherIds", new JsonArray())
					+ "|" + course.getJsonArray("groups", new JsonArray()) + "|" + course.getJsonArray("classes", new JsonArray());
			grouped.computeIfAbsent(key, k -> new ArrayList<>()).add(course);
		}
		return grouped;
	}

	// Motif généré par cet outil : "<salle> — <jour> HH:mm-HH:mm" (cf. courseSlotLabel). Sert à
	// reconnaître, parmi les réservations déjà en base, celles créées par un import précédent —
	// sans colonne dédiée en base, juste par la forme exacte et reconnaissable du texte.
	private static final String GENERATED_REASON_PATTERN =
			".+ — (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) [0-9]{2}:[0-9]{2}-[0-9]{2}:[0-9]{2}$";

	private void resolveRoomsAndImport(String structureId, Map<String, List<JsonObject>> grouped,
			long periodicEndDateSeconds, boolean dryRun, UserInfos user,
			Handler<Either<String, JsonObject>> handler) {
		String roomsQuery = "SELECT r.id, r.name FROM rbs.resource r"
				+ " INNER JOIN rbs.resource_type t ON r.type_id = t.id"
				+ " WHERE t.school_id = ?";
		Sql.getInstance().prepared(roomsQuery, new JsonArray().add(structureId), message -> {
			JsonArray rows = SqlResult.validResult(message).isRight()
					? SqlResult.validResult(message).right().getValue() : new JsonArray();
			Map<String, Long> resourceIdByName = new HashMap<>();
			Map<String, String> roomNameByResourceId = new HashMap<>();
			for (Object o : rows) {
				JsonObject row = (JsonObject) o;
				resourceIdByName.put(row.getString("name"), row.getLong("id"));
				roomNameByResourceId.put(String.valueOf(row.getLong("id")), row.getString("name"));
			}
			if (resourceIdByName.isEmpty()) {
				processGroups(new ArrayList<>(grouped.entrySet()), 0, resourceIdByName, periodicEndDateSeconds,
						dryRun, user, new JsonArray(), new JsonArray(), new JsonArray(), new JsonArray(),
						new HashMap<>(), new HashSet<>(), roomNameByResourceId, handler);
				return;
			}
			// Réservations déjà créées par un import précédent, pour repérer ensuite celles devenues
			// obsolètes (salle changée ou cours supprimé dans l'Emploi du temps depuis).
			String priorQuery = "SELECT b.id, b.resource_id, b.booking_reason FROM rbs.booking b"
					+ " INNER JOIN rbs.resource r ON b.resource_id = r.id"
					+ " INNER JOIN rbs.resource_type t ON r.type_id = t.id"
					+ " WHERE t.school_id = ? AND b.status != ? AND b.booking_reason ~ ?";
			Sql.getInstance().prepared(priorQuery,
					new JsonArray().add(structureId).add(REFUSED.status()).add(GENERATED_REASON_PATTERN),
					priorMessage -> {
				JsonArray priorRows = SqlResult.validResult(priorMessage).isRight()
						? SqlResult.validResult(priorMessage).right().getValue() : new JsonArray();
				Map<String, JsonObject> priorByKey = new LinkedHashMap<>();
				for (Object o : priorRows) {
					JsonObject row = (JsonObject) o;
					String key = row.getLong("resource_id") + "|" + row.getString("booking_reason");
					priorByKey.put(key, row);
				}
				processGroups(new ArrayList<>(grouped.entrySet()), 0, resourceIdByName, periodicEndDateSeconds,
						dryRun, user, new JsonArray(), new JsonArray(), new JsonArray(), new JsonArray(),
						priorByKey, new HashSet<>(), roomNameByResourceId, handler);
			});
		});
	}

	/** Phrase lisible décrivant un créneau ("vendredi 11:05-12:00") — juste le jour et l'horaire,
	 * sans matière ni classe/groupe : le nom de la salle (affiché séparément par l'appelant) plus
	 * le jour et l'heure suffisent à identifier le créneau dans l'Emploi du temps, sans surcharger
	 * l'affichage de détails superflus pour l'utilisateur. */
	private static String courseSlotLabel(LocalDateTime start, LocalDateTime end) {
		return frenchDayLabel(start.getDayOfWeek()) + " " + start.toLocalTime() + "-" + end.toLocalTime();
	}

	/** Fusionne les entrées "salle introuvable" par nom de salle : un même nom de salle peut
	 * revenir dans plusieurs groupes distincts (matières/classes différentes au même horaire, ou
	 * plusieurs semaines d'un même cours récurrent) — l'utilisateur doit voir chaque créneau
	 * "jour horaire" une seule fois, jamais répété plusieurs fois à l'identique. */
	private static JsonArray mergeUnmatchedRooms(JsonArray unmatchedRooms) {
		Map<String, LinkedHashSet<String>> slotsByRoom = new LinkedHashMap<>();
		for (Object o : unmatchedRooms) {
			JsonObject entry = (JsonObject) o;
			String roomLabel = entry.getString("roomLabel");
			LinkedHashSet<String> slots = slotsByRoom.computeIfAbsent(roomLabel, k -> new LinkedHashSet<>());
			for (Object label : entry.getJsonArray("courseLabels", new JsonArray())) {
				slots.add((String) label);
			}
		}
		JsonArray merged = new JsonArray();
		slotsByRoom.forEach((roomLabel, slots) ->
				merged.add(new JsonObject().put("roomLabel", roomLabel).put("occurrences", slots.size())
						.put("courseLabels", new JsonArray(new ArrayList<>(slots)))));
		return merged;
	}

	/** Calcule les réservations obsolètes (créées par un import précédent, mais dont le créneau ne
	 * correspond plus à aucun cours actuel — salle changée ou cours supprimé), puis, hors aperçu,
	 * les annule (statut refusé) avant de renvoyer la liste à l'utilisateur. */
	private void handleObsoleteBookings(Map<String, JsonObject> priorByKey, Set<String> claimedKeys,
			Map<String, String> roomNameByResourceId, boolean dryRun, Handler<JsonArray> handler) {
		List<JsonObject> staleRows = new ArrayList<>();
		for (Map.Entry<String, JsonObject> entry : priorByKey.entrySet()) {
			if (!claimedKeys.contains(entry.getKey())) {
				staleRows.add(entry.getValue());
			}
		}
		if (staleRows.isEmpty()) {
			handler.handle(new JsonArray());
			return;
		}
		JsonArray obsolete = new JsonArray();
		for (JsonObject row : staleRows) {
			obsolete.add(new JsonObject()
					.put("resourceId", row.getLong("resource_id"))
					.put("roomLabel", roomNameByResourceId.getOrDefault(String.valueOf(row.getLong("resource_id")), ""))
					.put("bookingReason", row.getString("booking_reason")));
		}
		if (dryRun) {
			handler.handle(obsolete);
			return;
		}
		JsonArray ids = new JsonArray();
		for (JsonObject row : staleRows) { ids.add(row.getLong("id")); }
		StringBuilder placeholders = new StringBuilder();
		JsonArray params = new JsonArray();
		params.add("Créneau obsolète : ce cours n'existe plus à cet horaire dans l'Emploi du temps.");
		for (int i = 0; i < ids.size(); i++) {
			if (i > 0) placeholders.append(",");
			placeholders.append("?");
			params.add(ids.getLong(i));
		}
		String cancelQuery = "UPDATE rbs.booking SET status = " + REFUSED.status()
				+ ", refusal_reason = ? WHERE id IN (" + placeholders + ")";
		Sql.getInstance().prepared(cancelQuery, params, cancelResult -> handler.handle(obsolete));
	}

	/** Traite les groupes un par un (séquentiel, volume attendu limité à quelques dizaines de
	 * créneaux par établissement) pour éviter les écritures concurrentes sur la même ressource.
	 * @param priorByKey réservations déjà créées par un import précédent ("resourceId|motif" ->
	 *        ligne), pour repérer en fin de parcours celles devenues obsolètes.
	 * @param claimedKeys clés "resourceId|motif" retrouvées dans l'Emploi du temps actuel — tout ce
	 *        qui reste dans priorByKey sans être dans claimedKeys est obsolète. */
	private void processGroups(List<Map.Entry<String, List<JsonObject>>> entries, int index,
			Map<String, Long> resourceIdByName, long periodicEndDateSeconds, boolean dryRun, UserInfos user,
			JsonArray created, JsonArray skippedExisting, JsonArray conflicts, JsonArray unmatchedRooms,
			Map<String, JsonObject> priorByKey, Set<String> claimedKeys, Map<String, String> roomNameByResourceId,
			Handler<Either<String, JsonObject>> handler) {
		if (index >= entries.size()) {
			handleObsoleteBookings(priorByKey, claimedKeys, roomNameByResourceId, dryRun, obsolete ->
					handler.handle(new Either.Right<>(new JsonObject()
							.put("created", created)
							.put("skippedExisting", skippedExisting)
							.put("conflicts", conflicts)
							.put("unmatchedRooms", mergeUnmatchedRooms(unmatchedRooms))
							.put("obsolete", obsolete))));
			return;
		}
		List<JsonObject> occurrences = entries.get(index).getValue();
		occurrences.sort(Comparator.comparing(c -> c.getString("startDate")));
		JsonObject first = occurrences.get(0);
		JsonArray roomLabels = first.getJsonArray("roomLabels", new JsonArray());
		String roomLabel = roomLabels.getString(0);
		Long resourceId = resourceIdByName.get(roomLabel);

		Runnable next = () -> processGroups(entries, index + 1, resourceIdByName, periodicEndDateSeconds,
				dryRun, user, created, skippedExisting, conflicts, unmatchedRooms, priorByKey, claimedKeys,
				roomNameByResourceId, handler);

		LocalDateTime firstStart = parseEdtDate(first.getString("startDate"));
		LocalDateTime firstEnd = parseEdtDate(first.getString("endDate"));
		// Motif court et lisible : nom de la salle + jour + horaire (ex. "Salle 101 — vendredi
		// 11:05-12:00"), sans jargon technique (pas d'UUID, pas de jour en anglais, pas de
		// préfixe "Import EDT"). Réutilisé tel quel comme clé de dédoublonnage.
		String slotLabel = courseSlotLabel(firstStart, firstEnd);

		if (resourceId == null) {
			unmatchedRooms.add(new JsonObject().put("roomLabel", roomLabel).put("occurrences", occurrences.size())
					.put("courseLabels", new JsonArray().add(slotLabel)));
			next.run();
			return;
		}

		String bookingReason = roomLabel + " — " + slotLabel;
		// Ce créneau existe toujours dans l'Emploi du temps actuel : la réservation correspondante
		// (si créée par un import précédent) n'est pas obsolète, même si elle est déjà couverte.
		claimedKeys.add(resourceId + "|" + bookingReason);

		String existsQuery = "SELECT 1 FROM rbs.booking WHERE resource_id = ? AND booking_reason = ? AND status != ? LIMIT 1";
		Sql.getInstance().prepared(existsQuery,
				new JsonArray().add(resourceId).add(bookingReason).add(REFUSED.status()), existsMessage -> {
			boolean alreadyExists = SqlResult.validResult(existsMessage).isRight()
					&& !SqlResult.validResult(existsMessage).right().getValue().isEmpty();
			if (alreadyExists) {
				skippedExisting.add(new JsonObject().put("resourceId", resourceId).put("bookingReason", bookingReason));
				next.run();
				return;
			}

			// Conflit = une réservation existante sur cette ressource, ce jour de la semaine et un
			// créneau horaire qui chevauche celui demandé (peu importe son motif — un chevauchement
			// avec N'IMPORTE QUELLE réservation d'un tiers doit être signalé, jamais écrasé).
			// SELECT * (pas juste "1") : l'utilisateur doit pouvoir voir CE QUI bloque, pas seulement
			// qu'un blocage existe — booking_reason + horaire de la réservation déjà en place.
			String conflictQuery = "SELECT booking_reason, start_date, end_date FROM rbs.booking"
					+ " WHERE resource_id = ? AND status != ? AND extract(dow from start_date) = ?"
					+ " AND start_date::time < ? AND end_date::time > ? ORDER BY start_date LIMIT 50";
			int dow = firstStart.getDayOfWeek().getValue() % 7; // java: 1=lundi..7=dimanche → postgres dow: 0=dimanche..6=samedi
			Sql.getInstance().prepared(conflictQuery, new JsonArray()
					.add(resourceId).add(REFUSED.status()).add(dow)
					.add(firstEnd.toLocalTime().toString()).add(firstStart.toLocalTime().toString()), conflictMessage -> {
				Either<String, JsonArray> conflictResult = SqlResult.validResult(conflictMessage);
				JsonArray existingRows = conflictResult.isRight() ? conflictResult.right().getValue() : new JsonArray();
				boolean hasConflict = !existingRows.isEmpty();
				if (hasConflict) {
					// Dédoublonne par motif : une réservation périodique existante revient une fois
					// par semaine (une ligne par occurrence en base) — l'utilisateur doit la voir
					// une seule fois, pas répétée pour chaque semaine à venir.
					Map<String, JsonObject> existingByReason = new LinkedHashMap<>();
					for (Object o : existingRows) {
						JsonObject row = (JsonObject) o;
						String reason = row.getString("booking_reason");
						if (existingByReason.containsKey(reason)) continue;
						LocalDateTime existingStart = LocalDateTime.parse(row.getString("start_date"));
						LocalDateTime existingEnd = LocalDateTime.parse(row.getString("end_date"));
						// La réservation existante est périodique (chaque semaine) : on ne montre que
						// sa PREMIÈRE occurrence à titre d'exemple (la requête est triée par date),
						// pas la liste de toutes les dates futures — d'où le mot "exemple" ici,
						// nécessaire pour ne pas laisser croire qu'elle n'a lieu qu'à cette date-là.
						existingByReason.put(reason, new JsonObject()
								.put("bookingReason", reason)
								.put("range", "toutes les semaines, par exemple le "
										+ existingStart.toLocalDate().format(FRENCH_DATE_FORMAT)
										+ " de " + existingStart.toLocalTime() + " à " + existingEnd.toLocalTime()));
					}
					JsonArray existingBookings = new JsonArray(new ArrayList<>(existingByReason.values()));
					conflicts.add(new JsonObject().put("resourceId", resourceId).put("roomLabel", roomLabel)
							.put("bookingReason", bookingReason).put("existingBookings", existingBookings));
					next.run();
					return;
				}

				JsonObject createdEntry = new JsonObject().put("resourceId", resourceId).put("roomLabel", roomLabel)
						.put("bookingReason", bookingReason);
				if (dryRun) {
					created.add(createdEntry);
					next.run();
					return;
				}

				boolean[] days = new boolean[7];
				days[dow] = true;
				JsonArray daysArray = new JsonArray();
				for (boolean d : days) daysArray.add(d);

				// Bug réel trouvé en test manuel : firstStart/firstEnd sont une heure LOCALE
				// Europe/Paris (issue du texte brut de l'Emploi du temps), pas UTC — les convertir
				// avec ZoneOffset.UTC (décalage 0) au lieu de la vraie zone Europe/Paris décalait
				// silencieusement l'heure réellement stockée d'une heure (hiver) ou deux (été) par
				// rapport à l'heure annoncée dans le motif ("09:00-10:00" en texte, 10:00-11:00
				// réellement enregistré) — les réservations semblaient alors introuvables dans
				// l'agenda à l'heure attendue.
				JsonObject bookingJson = new JsonObject()
						.put("booking_reason", bookingReason)
						.put("slots", new JsonArray().add(new JsonObject()
								.put("start_date", firstStart.atZone(ZoneId.of("Europe/Paris")).toEpochSecond())
								.put("end_date", firstEnd.atZone(ZoneId.of("Europe/Paris")).toEpochSecond())
								.put("iana", "Europe/Paris")))
						.put("periodic_end_date", periodicEndDateSeconds)
						.put("periodicity", 1)
						.put("days", daysArray)
						.put("quantity", 1);
				Booking booking = new Booking(bookingJson, null, new Slots(bookingJson.getJsonArray("slots")));
				bookingService.createPeriodicBooking(String.valueOf(resourceId), booking, user, createResult -> {
					if (createResult.isRight()) {
						created.add(createdEntry);
					} else {
						conflicts.add(createdEntry.put("error", createResult.left().getValue()));
					}
					next.run();
				});
			});
		});
	}
}
