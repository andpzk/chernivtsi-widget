package ua.chernivtsi.electricity;

import java.util.HashMap;
import java.util.Map;

record WidgetDesign(int revision, float ringSpacing, float wideSpacing, float ringTimeSize,
                    float wideTimeSize, float twoDayTimeSize, float ringStroke,
                    int onColor, int offColor, int possibleColor, int unknownColor) {
    static final WidgetDesign DEFAULT = new WidgetDesign(0, 0, 0, 24, 26, 24, 4.5f,
            0xff72c69b, 0xffdc8587, 0xffcfb879, 0xff707986);

    static WidgetDesign newer(String source, WidgetDesign current) {
        WidgetDesign next = parse(source);
        return next != null && next.revision > current.revision ? next : null;
    }

    static WidgetDesign parse(String source) {
        if (source == null || source.length() > 2048) return null;
        Map<String, String> values = new HashMap<>();
        for (String raw : source.split("\\r?\\n")) {
            String line = raw.trim();
            if (line.isEmpty() || line.startsWith("#")) continue;
            String[] field = line.split("=", -1);
            if (field.length != 2 || values.put(field[0].trim(), field[1].trim()) != null) return null;
        }
        if (values.size() != 12 || !"1".equals(values.get("schema"))) return null;
        try {
            return new WidgetDesign(Integer.parseInt(required(values, "revision", "[1-9][0-9]{0,8}")),
                    number(values, "ringSpacing", -1, 2),
                    number(values, "wideSpacing", -1, 3),
                    number(values, "ringTimeSize", 18, 25),
                    number(values, "wideTimeSize", 19, 27),
                    number(values, "twoDayTimeSize", 18, 26),
                    number(values, "ringStroke", 3, 6),
                    color(values, "onColor"), color(values, "offColor"),
                    color(values, "possibleColor"), color(values, "unknownColor"));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String required(Map<String, String> values, String key, String pattern) {
        String value = values.get(key);
        if (value == null || !value.matches(pattern)) throw new IllegalArgumentException(key);
        return value;
    }

    private static float number(Map<String, String> values, String key, float min, float max) {
        float value = Float.parseFloat(required(values, key, "-?[0-9]{1,2}(\\.[0-9]{1,2})?"));
        if (value < min || value > max) throw new IllegalArgumentException(key);
        return value;
    }

    private static int color(Map<String, String> values, String key) {
        return 0xff000000 | Integer.parseInt(required(values, key, "[0-9a-fA-F]{6}"), 16);
    }

    int chartColor(char state) {
        return switch (state) {
            case '+' -> onColor;
            case '-' -> offColor;
            case '~' -> possibleColor;
            default -> unknownColor;
        };
    }
}
