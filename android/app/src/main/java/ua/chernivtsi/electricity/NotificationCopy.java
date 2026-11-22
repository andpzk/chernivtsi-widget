package ua.chernivtsi.electricity;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class NotificationCopy {
    static final int LIMIT = 16 * 1024;
    private static final Pattern TOKEN = Pattern.compile("\\{[0-3]\\}");
    private final Map<String, String> values;
    final int revision;

    private NotificationCopy(Map<String, String> values, int revision) {
        this.values = values;
        this.revision = revision;
    }

    static NotificationCopy parse(String source) {
        if (source == null || source.length() > LIMIT) return null;
        Map<String, String> values = new HashMap<>();
        for (String line : source.split("\\r?\\n")) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("#")) continue;
            int split = line.indexOf('=');
            if (split <= 0) return null;
            String key = line.substring(0, split), value = line.substring(split + 1).trim();
            String literal = TOKEN.matcher(value).replaceAll("");
            if (value.isEmpty() || value.length() > 200 || literal.contains("{") || literal.contains("}")
                    || values.put(key, value) != null) return null;
        }
        if (!"1".equals(values.remove("schema"))) return null;
        String rev = values.remove("revision");
        if (rev == null || !rev.matches("[1-9][0-9]{0,8}")) return null;
        return new NotificationCopy(values, Integer.parseInt(rev));
    }

    NotificationCopy updated(String source) {
        NotificationCopy next = parse(source);
        if (next == null || next.revision <= revision || !next.values.keySet().equals(values.keySet())) return this;
        for (String key : values.keySet()) {
            if (!tokens(values.get(key)).equals(tokens(next.values.get(key)))) return this;
        }
        return next;
    }

    private static Set<String> tokens(String template) {
        Set<String> result = new HashSet<>();
        Matcher m = TOKEN.matcher(template);
        while (m.find()) result.add(m.group());
        return result;
    }

    String text(String key, String... args) {
        String template = values.get(key);
        Matcher m = TOKEN.matcher(template);
        StringBuffer result = new StringBuffer();
        while (m.find()) m.appendReplacement(result, Matcher.quoteReplacement(args[m.group().charAt(1) - '0']));
        m.appendTail(result);
        return result.toString();
    }
}
