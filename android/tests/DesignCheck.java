package ua.chernivtsi.electricity;

import java.nio.file.Files;
import java.nio.file.Path;

public final class DesignCheck {
    public static void main(String[] args) throws Exception {
        String baseline = Files.readString(Path.of(args[0]));
        WidgetDesign expected = WidgetDesign.parse(baseline);
        assert expected != null && expected.revision() == 1;
        assert expected.ringSpacing() == WidgetDesign.DEFAULT.ringSpacing();
        assert expected.wideSpacing() == WidgetDesign.DEFAULT.wideSpacing();
        assert expected.ringTimeSize() == WidgetDesign.DEFAULT.ringTimeSize();
        assert expected.wideTimeSize() == WidgetDesign.DEFAULT.wideTimeSize();
        assert expected.twoDayTimeSize() == WidgetDesign.DEFAULT.twoDayTimeSize();
        assert expected.ringStroke() == WidgetDesign.DEFAULT.ringStroke();
        assert expected.chartColor('+') == WidgetDesign.DEFAULT.chartColor('+');
        String changed = baseline.replace("revision=1", "revision=2")
                .replace("ringSpacing=0", "ringSpacing=2").replace("wideSpacing=0", "wideSpacing=3");
        WidgetDesign update = WidgetDesign.newer(changed, expected);
        assert update != null && update.revision() == 2 && update.ringSpacing() == 2 && update.wideSpacing() == 3;
        assert WidgetDesign.newer(baseline, update) == null : "Don't roll back the saved design";
        assert WidgetDesign.newer(changed, update) == null : "Don't apply the same revision twice";
        assert WidgetDesign.parse(changed.replace("wideSpacing=3", "wideSpacing=100")) == null;
        assert WidgetDesign.parse(changed.replace("schema=1", "schema=2")) == null;
        assert WidgetDesign.parse(changed.replace("72C69B", "yellow")) == null;
        assert WidgetDesign.parse(changed + "\nringSpacing=1\n") == null;
        assert WidgetDesign.parse(changed.replace("unknownColor=707986", "payload=anything")) == null;
        assert WidgetDesign.parse("<html>GitHub is unavailable</html>") == null;
        System.out.println("Android design checks passed");
    }
}
