package ua.chernivtsi.electricity;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;

public final class ScheduleCheck {
    public static void main(String[] files) throws Exception {
        Instant evening = Instant.parse("2026-11-07T21:30:00Z");
        LocalDate date = Schedule.kyiv(evening).toLocalDate();
        assert date.equals(LocalDate.of(2026, 11, 7));
        String first = Files.readString(Path.of(files[0]));
        String second = Files.readString(Path.of(files[1]));
        Schedule.Day group1 = Schedule.official(first, 1, date, evening);
        Schedule.Day group12 = Schedule.official(first, 12, date, evening);
        assert group1 != null && group12 != null;
        assert group12.cells.length() == 48;
        assert !group1.cells.equals(group12.cells) : "Groups must have different schedules";
        assert Schedule.official(first, 12, date.plusDays(1), evening) == null;
        assert Schedule.official(first.replace("<u>з</u>", "<u>?</u>"), 12, date, evening) == null;
        Schedule.Day tomorrow = Schedule.official(second, 12, date.plusDays(1), evening);
        assert tomorrow != null && tomorrow.cells.length() == 48;

        Schedule.Pair live = Schedule.select(group12, tomorrow, null, null, null, true, date);
        assert live.today == group12 && live.tomorrow == tomorrow;
        Schedule.Pair futureOnly = Schedule.select(null, tomorrow, null, null, null, false, date);
        assert futureOnly.today == null && futureOnly.tomorrow == tomorrow;
        Schedule.Pair offline = Schedule.select(group12, null, null, group12, tomorrow, false, date);
        assert offline.today == group12 && offline.tomorrow == tomorrow;
        Schedule.Pair withdrawn = Schedule.select(null, null, null, group12, tomorrow, true, date);
        assert withdrawn.today == group12 && withdrawn.tomorrow == null;
        Instant midnight = Instant.parse("2026-11-07T22:05:00Z");
        LocalDate nextDate = Schedule.kyiv(midnight).toLocalDate();
        Schedule.Pair rolled = Schedule.select(null, null, null, group12, tomorrow, false, nextDate);
        assert rolled.today == tomorrow && rolled.tomorrow == null;

        Schedule.Day emergency = Schedule.official("<article class='wrap_article_v2_emergency'>", 12, date, evening);
        Schedule.Day community = new Schedule.Day(date, Schedule.UNKNOWN.replace('?', '+'), evening, evening, false, false);
        assert emergency != null && emergency.emergency;
        assert Schedule.select(null, tomorrow, community, emergency, null, true, date).today == emergency;
        assert Schedule.select(emergency, tomorrow, community, null, null, true, date).tomorrow == null;
        assert !Schedule.fresh(group12, evening.plusSeconds(86401));
        assert Schedule.communityCells(Arrays.asList(new String[24])) == null;
        assert Schedule.communityCells(java.util.Collections.nCopies(24, "first")).equals("-+".repeat(24));
        Schedule.Event acrossMidnight = Schedule.event("+".repeat(46) + "--", "--" + "+".repeat(46), 47);
        assert acrossMidnight.state == '-' && acrossMidnight.start == 46 && acrossMidnight.end == 50;
        assert Schedule.clock(48).equals("24:00") && Schedule.clock(50).equals("01:00");
        assert Schedule.event("+" + "?".repeat(47), null, 0).state == '?';
        System.out.println("Android schedule checks passed");
    }
}
