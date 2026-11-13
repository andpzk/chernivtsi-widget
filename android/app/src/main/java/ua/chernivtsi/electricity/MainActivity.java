package ua.chernivtsi.electricity;

import android.app.Activity;
import android.os.Bundle;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.graphics.Typeface;

public final class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setBackgroundColor(0xffedf2f6);
        page.setPadding(dp(24), dp(32), dp(24), dp(24));
        scroll.addView(page);
        setContentView(scroll);
        add(page, "Чернівці Світло", 28, true, 16);
        add(page, "Затисніть порожнє місце на головному екрані та відкрийте меню «Віджети». Знайдіть «Чернівці Світло», виберіть кільце або широкий графік і вкажіть свою групу.", 16, false, 16);
        add(page, "Торкніться віджета, щоб оновити графік або змінити його групу.", 16, false, 22);
        add(page, "Зелений — є світло\nЧервоний — відключення\nЖовтий — можливе заживлення\nСірий — немає даних", 15, false, 16);
        add(page, "Віджет показує плановий графік Чернівціобленерго за київським часом.", 14, false, 0);
    }

    private void add(LinearLayout page, String value, int size, boolean bold, int bottomMargin) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(0xff192431);
        if (bold) view.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.bottomMargin = dp(bottomMargin);
        page.addView(view, params);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
