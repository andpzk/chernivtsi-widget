package ua.chernivtsi.electricity;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class Schedule {
    static final String OFFICIAL_URL = "https://oblenergo.cv.ua/shutdowns/";
    static final String FALLBACK_URL = "https://raw.githubusercontent.com/chaichuk/UA-power-outages-monitor/main/artifacts/chernivtsi.json";
    static final String UNKNOWN = "????????????????????????????????????????????????";
    private static final ZoneId KYIV = ZoneId.of("Europe/Kiev");
    private static final Pattern TABLE = html("<div\\b[^>]*\\bid=['\"]gsv['\"][^>]*>(.*)");
    private static final Pattern EMERGENCY = html("class=['\"][^'\"]*\\bwrap_article_v2_emergency\\b");
    private static final Pattern DATE = html("<ul\\b[^>]*>\\s*<p\\b[^>]*>\\s*(\\d{2})\\.(\\d{2})\\.(\\d{4})");
    private static final Pattern SOURCE = html("<[^>]+\\bid=['\"]gsv_a['\"][^>]*>(.*?)</div>");
    private static final Pattern TIME = Pattern.compile("\\b([01]?\\d|2[0-3]):([0-5]\\d)\\b");
    private static final Pattern AXIS = html("</ul>\\s*<div\\b[^>]*>\\s*<p\\b[^>]*>(.*?)</p>");
    private static final Pattern HOUR = html("<b\\b[^>]*>\\s*(\\d{1,2})\\s*<em\\b[^>]*>:00</em>\\s*</b>");
    private static final Pattern CELL = html("<(u|o|s)\\b[^>]*>([^<]*)</\\1>");

    static final class Day {
        final LocalDate date;
        final String cells;
        final Instant sourceAt;
        final Instant checkedAt;
        final boolean emergency;
        final boolean official;

        Day(LocalDate date, String cells, Instant sourceAt, Instant checkedAt, boolean emergency, boolean official) {
            this.date = date;
            this.cells = cells;
            this.sourceAt = sourceAt;
            this.checkedAt = checkedAt;
            this.emergency = emergency;
            this.official = official;
        }
    }

    static final class Pair {
        final Day today;
        final Day tomorrow;

        Pair(Day today, Day tomorrow) {
            this.today = today;
            this.tomorrow = tomorrow;
        }
    }

    static final class Event {
        final char state;
        final int start;
        final int end;

        Event(char state, int start, int end) {
            this.state = state;
            this.start = start;
            this.end = end;
        }
    }

    static ZonedDateTime kyiv(Instant instant) {
        return instant.atZone(KYIV);
    }

    static Day official(String page, int group, LocalDate expected, Instant now) {
        if (page == null || group < 1 || group > 12) return null;
        Matcher table = TABLE.matcher(page);
        if (!table.find()) {
            return EMERGENCY.matcher(page).find() && expected.equals(kyiv(now).toLocalDate())
                    ? new Day(expected, UNKNOWN, now, now, true, true) : null;
        }
        String body = table.group(1);
        Matcher date = DATE.matcher(body);
        Matcher source = SOURCE.matcher(page);
        Matcher axis = AXIS.matcher(body);
        Matcher row = html("<div\\b[^>]*\\bid=['\"]inf" + group + "['\"][^>]*>(.*?)</div>").matcher(body);
        if (!date.find() || !source.find() || !axis.find() || !row.find()) return null;
        if (!expected.toString().equals(date.group(3) + "-" + date.group(2) + "-" + date.group(1))) return null;
        Matcher time = TIME.matcher(source.group(1).replaceAll("<[^>]*>", " "));
        if (!time.find()) return null;
        Instant sourceAt = kyiv(now).toLocalDate()
                .atTime(LocalTime.of(Integer.parseInt(time.group(1)), Integer.parseInt(time.group(2))))
                .atZone(KYIV).toInstant();
        if (sourceAt.isAfter(now.plusSeconds(300))) return null;

        Matcher hour = HOUR.matcher(axis.group(1));
        int firstHour = -1;
        int previous = -1;
        while (hour.find()) {
            int current = Integer.parseInt(hour.group(1));
            if (current == 0 && previous == 23 && !hour.find()) break;
            if (current > 23 || (previous >= 0 && current != previous + 1)) return null;
            if (firstHour < 0) firstHour = current;
            previous = current;
        }
        if (previous != 23) return null;
        char[] cells = UNKNOWN.toCharArray();
        int slot = firstHour * 2;
        Matcher cell = CELL.matcher(row.group(1));
        while (cell.find()) {
            char state = switch (cell.group(1).toLowerCase(Locale.ROOT) + cell.group(2).trim().toUpperCase(Locale.ROOT)) {
                case "uЗ" -> '+';
                case "oВ" -> '-';
                case "sМЗ" -> '~';
                default -> '?';
            };
            if (state == '?' || slot == cells.length) return null;
            cells[slot++] = state;
        }
        return slot == cells.length ? new Day(expected, new String(cells), sourceAt, now, false, true) : null;
    }

    static String communityCells(List<String> hours) {
        if (hours.size() != 24) return null;
        StringBuilder cells = new StringBuilder(48);
        for (String hour : hours) {
            if (hour == null) return null;
            switch (hour) {
                case "yes" -> cells.append("++");
                case "no" -> cells.append("--");
                case "first" -> cells.append("-+");
                case "second" -> cells.append("+-");
                default -> { return null; }
            }
        }
        return cells.toString();
    }

    static boolean fresh(Day day, Instant now) {
        return day != null && !day.sourceAt.isAfter(now.plusSeconds(300))
                && !day.checkedAt.isAfter(now.plusSeconds(300))
                && Duration.between(day.checkedAt, now).compareTo(Duration.ofDays(1)) < 0;
    }

    static Pair select(Day official, Day future, Day community, Day savedToday, Day savedTomorrow,
                       boolean futureRead, LocalDate date) {
        Day cached = dated(savedToday, date) ? savedToday : dated(savedTomorrow, date) ? savedTomorrow : null;
        Day today = official;
        if (today == null) {
            today = cached != null && (cached.emergency || (cached.official && future != null))
                    ? cached : community != null ? community : cached;
        }
        Day tomorrow = future;
        if (tomorrow == null && !futureRead && dated(savedTomorrow, date.plusDays(1))) tomorrow = savedTomorrow;
        return new Pair(today, today != null && today.emergency ? null : tomorrow);
    }

    static boolean dated(Day day, LocalDate date) {
        return day != null && day.date.equals(date);
    }

    static Event event(String today, String tomorrow, int slot) {
        String cells = tomorrow == null ? today : today + tomorrow;
        char current = cells.charAt(slot);
        if (current == '?') return null;
        int start = slot;
        if (current == '+') {
            while (start < cells.length() && cells.charAt(start) == '+') start++;
            if (start == cells.length()) return null;
        } else {
            while (start > 0 && cells.charAt(start - 1) == current) start--;
        }
        char next = cells.charAt(start);
        int end = start + 1;
        while (end < cells.length() && cells.charAt(end) == next) end++;
        return new Event(next, start, end);
    }

    static String clock(int slot) {
        int withinDay = slot == 0 ? 0 : (slot - 1) % 48 + 1;
        return String.format(Locale.ROOT, "%02d:%02d", withinDay / 2, withinDay % 2 * 30);
    }

    private static Pattern html(String expression) {
        return Pattern.compile(expression, Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    }
}
