package ua.chernivtsi.electricity;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

final class WidgetArt {
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm", Locale.ROOT);
    private final Canvas canvas;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final boolean dark;
    private final WidgetDesign design;
    private final int ink;
    private final int muted;

    WidgetArt(Canvas canvas, boolean dark, WidgetDesign design) {
        this.canvas = canvas;
        this.dark = dark;
        this.design = design;
        ink = dark ? 0xfff6f7fb : 0xff181b23;
        muted = dark ? 0xffb5bdcd : 0xff525e70;
    }

    static Bitmap draw(int width, int height, boolean wide, boolean dark, Model model, WidgetDesign design) {
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        WidgetArt art = new WidgetArt(canvas, dark, design);
        float designWidth = wide ? 364 : 170;
        float designHeight = 170;
        float scale = Math.min(width / designWidth, height / designHeight);
        canvas.translate((width - designWidth * scale) / 2, (height - designHeight * scale) / 2);
        canvas.scale(scale, scale);
        art.background(designWidth, designHeight);
        if (wide) art.wide(designWidth, model);
        else art.ring(model);
        return bitmap;
    }

    private void background(float width, float height) {
        int[] colors = dark ? new int[]{0xff202f38, 0xff111925, 0xff0b121c, 0xff202d40}
                : new int[]{0xfff5f8fc, 0xffe8eef5, 0xffe1e8f1, 0xffdce4ee};
        paint.setShader(new LinearGradient(0, 0, width, height, colors, new float[]{0, .3f, .65f, 1}, Shader.TileMode.CLAMP));
        float radius = 26;
        canvas.drawRoundRect(0, 0, width, height, radius, radius, paint);
        paint.setShader(null);
        int clip = canvas.save();
        Path outline = new Path();
        outline.addRoundRect(0, 0, width, height, radius, radius, Path.Direction.CW);
        canvas.clipPath(outline);
        for (int i = 40; i > 0; i--) {
            float s = i / 40f;
            float x = width * (.2f - s * .75f);
            float y = -height * (.22f + s * .6f);
            paint.setColor(0x02ffffff);
            canvas.drawOval(x, y, x + width * s * 1.5f, y + height * s * 1.2f, paint);
            x = width * (1 - s * .7f);
            y = height * (1.22f - s * .5f);
            paint.setColor(0x01dceaff);
            canvas.drawOval(x, y, x + width * s * 1.4f, y + height * s, paint);
        }
        canvas.restoreToCount(clip);
        paint.setColor(dark ? 0x29ffffff : 0x95ffffff);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(.85f);
        canvas.drawRoundRect(.5f, .5f, width - .5f, height - .5f, radius, radius, paint);
        paint.setStyle(Paint.Style.FILL);
    }

    private void ring(Model model) {
        float center = 85, radius = 70;
        RectF circle = new RectF(center - radius, center - radius, center + radius, center + radius);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(design.ringStroke());
        for (int slot = 0; slot < 48;) {
            char state = model.cells.charAt(slot);
            paint.setColor(design.chartColor(state));
            float start = slot * 7.5f - 90;
            int end = runEnd(model.cells, slot);
            canvas.drawArc(circle, start, 7.5f * (end - slot) + .05f, false, paint);
            slot = end;
        }
        paint.setStyle(Paint.Style.FILL);
        double angle = model.minute * Math.PI / 720 - Math.PI / 2;
        line(center + (radius - 3.5f) * (float) Math.cos(angle), center + (radius - 3.5f) * (float) Math.sin(angle),
                center + (radius + 3.5f) * (float) Math.cos(angle), center + (radius + 3.5f) * (float) Math.sin(angle), ink, 1.8f);
        float gap = design.ringSpacing();
        badge(model, center, 54 - 2 * gap, true);
        text(model.smallHeadline, center, 71 - gap, 13, muted, false, Paint.Align.CENTER, 116);
        text(model.range.isEmpty() ? model.emptyRange : model.range, center, 94, design.ringTimeSize(),
                ink, true, Paint.Align.CENTER, 125);
        text("Чернівці · " + model.group, center, 113 + gap, 13, muted, false, Paint.Align.CENTER, 110);
        checked(model.check, center, 128 + 2 * gap, true);
    }

    private void wide(float width, Model model) {
        float x = 16, right = width - x, center = width / 2;
        text("Чернівці", x, 25, 14, ink, true, Paint.Align.LEFT, 140);
        text(model.group + " група", x, 38, 10, muted, false, Paint.Align.LEFT, 140);
        badge(model, right, 25, false);
        checked(model.check, right, 38, false);
        boolean twoRows = model.tomorrow != null;
        float graphTop = twoRows ? 105 : 124;
        float timeBaseline = twoRows ? 83 : model.following.isEmpty() ? 96 : 92;
        text(model.headline, center, timeBaseline - (twoRows ? 27 : 29) - design.wideSpacing(),
                11, muted, false, Paint.Align.CENTER, 285);
        String summary = model.range.isEmpty() ? model.emptyRange : model.range.replace("–", "  —  ");
        text(summary, center, timeBaseline, model.range.isEmpty() ? 25 : twoRows ? design.twoDayTimeSize() : design.wideTimeSize(),
                ink, true, Paint.Align.CENTER, 320);
        if (!twoRows) text(model.following, center, timeBaseline + 19 + design.wideSpacing(),
                10, muted, false, Paint.Align.CENTER, 290);
        float graphWidth = right - x;
        if (twoRows) text("Сьогодні", x, graphTop - 4, 9, muted, false, Paint.Align.LEFT, 100);
        strip(model.cells, x, graphTop, graphWidth);
        float marker = axisX(x, graphWidth, model.minute / 1440f);
        line(marker, graphTop - 2.5f, marker, graphTop + 9.5f, ink, 1.5f);
        float axisTop = graphTop + 11;
        if (twoRows) {
            float nextTop = graphTop + 22 + design.wideSpacing();
            text("Завтра", x, nextTop - 4, 9, muted, false, Paint.Align.LEFT, 100);
            strip(model.tomorrow, x, nextTop, graphWidth);
            axisTop = nextTop + 11;
        }
        for (int hour = 0; hour <= 24; hour += 3) {
            float tick = axisX(x, graphWidth, hour / 24f);
            line(tick, axisTop - 2, tick, axisTop + 1, muted, .8f);
            String label = !twoRows && !model.twentyFour && hour != 24
                    ? Integer.toString(hour % 12 == 0 ? 12 : hour % 12)
                    : String.format(Locale.ROOT, "%02d", hour);
            text(label, tick, axisTop + 15, 12, muted, false, Paint.Align.CENTER, 24);
        }
    }

    private void strip(String cells, float x, float y, float width) {
        int saved = canvas.save();
        Path shape = new Path();
        shape.addRoundRect(x, y, x + width, y + 7, 3.5f, 3.5f, Path.Direction.CW);
        canvas.clipPath(shape);
        for (int slot = 0; slot < 48;) {
            char state = cells.charAt(slot);
            int end = runEnd(cells, slot);
            float left = slot == 0 ? x : axisX(x, width, slot / 48f);
            float right = end == 48 ? x + width : axisX(x, width, end / 48f);
            paint.setColor(design.chartColor(state));
            canvas.drawRect(left, y, right, y + 7, paint);
            slot = end;
        }
        canvas.restoreToCount(saved);
    }

    private static float axisX(float x, float width, float fraction) {
        return x + width * (16 + 568 * fraction) / 600;
    }

    private static int runEnd(String cells, int start) {
        int end = start + 1;
        while (end < cells.length() && cells.charAt(start) == cells.charAt(end)) end++;
        return end;
    }

    private void text(String text, float x, float y, float size, int color, boolean bold, Paint.Align align, float max) {
        if (text.isEmpty()) return;
        paint.setColor(color);
        paint.setTypeface(Typeface.create(bold ? "sans-serif-medium" : "sans-serif", Typeface.NORMAL));
        paint.setTextAlign(align);
        paint.setTextSize(size);
        float measured = paint.measureText(text);
        if (measured > max) paint.setTextSize(size * max / measured);
        canvas.drawText(text, x, y, paint);
    }

    private void line(float x, float y, float endX, float endY, int color, float width) {
        paint.setColor(color);
        paint.setStrokeWidth(width);
        canvas.drawLine(x, y, endX, endY, paint);
    }

    private void badge(Model model, float anchor, float y, boolean small) {
        String label = small ? switch (model.state) {
            case '+' -> "Є";
            case '-' -> "Нема";
            case '~' -> "Можливо";
            default -> model.status;
        } : model.status;
        float size = small ? 13 : 14;
        paint.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        paint.setTextSize(size);
        float width = paint.measureText(label);
        float left = anchor - (small ? (width + 15) / 2 : width + 17);
        float x = left + 5, cy = y - 5;
        int color = stateInk(model.state);
        if (model.state == '?') {
            paint.setStyle(Paint.Style.STROKE);
            paint.setColor(color);
            paint.setStrokeWidth(1);
            canvas.drawCircle(x, cy, 4.5f, paint);
            paint.setStyle(Paint.Style.FILL);
            text("?", x, cy + 2, 6.5f, color, true, Paint.Align.CENTER, 6);
        } else {
            Path bolt = new Path();
            bolt.moveTo(x + 1, cy - 6);
            bolt.lineTo(x - 4.5f, cy + 1);
            bolt.lineTo(x - .5f, cy + 1);
            bolt.lineTo(x - 1, cy + 6);
            bolt.lineTo(x + 4.5f, cy - 1.5f);
            bolt.lineTo(x + .5f, cy - 1.5f);
            bolt.close();
            paint.setColor(color);
            canvas.drawPath(bolt, paint);
            if (model.state == '-') line(x - 5, cy - 5, x + 5, cy + 5, color, 1.25f);
        }
        text(label, left + (small ? 15 : 17), y, size, color, true, Paint.Align.LEFT, 140);
    }

    private void checked(String check, float anchor, float y, boolean center) {
        if (check.isEmpty()) return;
        text("↻  " + check, anchor, y, 9, muted, false, center ? Paint.Align.CENTER : Paint.Align.RIGHT, 66);
    }

    private int stateInk(char state) {
        return switch (state) {
            case '+' -> dark ? 0xff72c69b : 0xff397359;
            case '-' -> dark ? 0xffdc8587 : 0xff914c52;
            case '~' -> dark ? 0xffcfb879 : 0xff825714;
            default -> muted;
        };
    }

    static final class Model {
        final int group;
        final int minute;
        final char state;
        final boolean twentyFour;
        final String cells, tomorrow, headline, smallHeadline, range, following, status, check, emptyRange;

        Model(Schedule.Pair data, int group, Instant now, boolean wide, boolean loading, boolean twentyFour) {
            ZonedDateTime time = Schedule.kyiv(now);
            this.group = group;
            this.twentyFour = twentyFour;
            minute = time.getHour() * 60 + time.getMinute();
            boolean emergency = data.today != null && data.today.emergency;
            cells = data.today == null ? Schedule.UNKNOWN : data.today.cells;
            tomorrow = data.tomorrow == null ? null : data.tomorrow.cells;
            state = cells.charAt(minute / 30);
            status = emergency ? "Аварійний режим" : loading ? "Оновлюємо графік" : switch (state) {
                case '+' -> "Є світло";
                case '-' -> "Нема світла";
                case '~' -> "Зараз буде";
                default -> "Немає даних";
            };
            Schedule.Event event = Schedule.event(cells, tomorrow, minute / 30);
            if (event != null && event.state != '?') {
                String day = event.start >= 48 ? " · завтра" : event.end > 48 ? " · до завтра" : "";
                String label = event.state == '~' ? "Невизначений період"
                        : state == '+' ? "Наступне відключення" : "Відключення триває";
                headline = label + day;
                smallHeadline = state == '+' && event.state != '~' ? "Наступне" + day
                        : state == '-' ? "Ще триває" + day : headline;
                range = clock(event.start % 48, twentyFour) + "–" + clock(event.end, twentyFour);
                following = nextLabel(cells, event.end, twentyFour);
            } else {
                headline = emergency ? "Плановий графік" : state == '+' && event == null ? "До кінця дня" : "За графіком";
                smallHeadline = headline;
                range = "";
                following = "";
            }
            emptyRange = state == '+' ? (event == null ? "Без відключень" : "Далі немає даних")
                    : emergency ? "Не діє" : loading ? "Зачекайте…" : "Графік відсутній";
            Schedule.Day checked = data.today;
            if (wide && data.tomorrow != null && (checked == null || data.tomorrow.checkedAt.isBefore(checked.checkedAt))) {
                checked = data.tomorrow;
            }
            check = checked == null ? "" : TIME.format(Schedule.kyiv(checked.checkedAt));
        }

        private static String clock(int slot, boolean twentyFour) {
            if (twentyFour) return Schedule.clock(slot);
            int hour = slot / 2 % 24;
            return String.format(Locale.ROOT, "%d:%02d %s", hour % 12 == 0 ? 12 : hour % 12,
                    slot % 2 * 30, hour < 12 ? "AM" : "PM");
        }

        private static String nextLabel(String cells, int start, boolean twentyFour) {
            if (start >= cells.length() || cells.charAt(start) == '?') return "";
            char next = cells.charAt(start);
            return "Потім " + clock(start, twentyFour) + " – " + clock(runEnd(cells, start), twentyFour) + " · "
                    + (next == '~' ? "можливе заживлення" : next == '+' ? "заживлення" : "відключення");
        }

        String accessibility(boolean wide) {
            String label = "Чернівці, група " + group + ". " + status + ". "
                    + (range.isEmpty() ? emptyRange : headline + " " + range) + ".";
            if (!check.isEmpty()) label += " Перевірено о " + check + ".";
            if (wide) label += tomorrow == null ? " Графіка на завтра ще немає." : " Графік на завтра опубліковано.";
            return label + " Налаштувати або оновити.";
        }
    }
}
