package ua.chernivtsi.electricity;

import android.app.Activity;
import android.app.AlertDialog;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;

public final class GroupActivity extends Activity {
    static final String ACTION_WIDGET_MENU = "ua.chernivtsi.electricity.WIDGET_MENU";
    private int id;
    private int selected;
    private boolean menu;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        id = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        setResult(RESULT_CANCELED, result());
        if (!PowerWidget.owns(this, id)) {
            finish();
            return;
        }
        menu = state == null ? ACTION_WIDGET_MENU.equals(getIntent().getAction()) : state.getBoolean("menu");
        selected = state == null ? PowerWidget.group(this, id) : state.getInt("selected");
        if (menu && selected != 0) showMenu();
        else chooseGroup();
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        state.putBoolean("menu", menu);
        state.putInt("selected", selected);
    }

    private void showMenu() {
        new AlertDialog.Builder(this)
                .setTitle("Чернівці · група " + selected)
                .setItems(new String[]{"Оновити графік", "Змінити групу"}, (dialog, item) -> {
                    if (item == 0) apply();
                    else chooseGroup();
                })
                .setNegativeButton("Закрити", (dialog, item) -> finish())
                .setOnCancelListener(dialog -> finish())
                .show();
    }

    private void chooseGroup() {
        menu = false;
        String[] groups = new String[12];
        for (int group = 1; group <= groups.length; group++) groups[group - 1] = "Група " + group;
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Група для цього віджета")
                .setSingleChoiceItems(groups, selected - 1, (list, index) -> {
                    selected = index + 1;
                    ((AlertDialog) list).getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
                })
                .setPositiveButton("Зберегти", (list, item) -> apply())
                .setNegativeButton("Скасувати", (list, item) -> finish())
                .setOnCancelListener(list -> finish())
                .show();
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(selected >= 1 && selected <= 12);
    }

    private void apply() {
        if (selected >= 1 && selected <= 12 && PowerWidget.owns(this, id)) {
            PowerWidget.setGroup(this, id, selected);
            PowerWidget.show(this, id, true);
            RefreshService.schedule(this, true);
            setResult(RESULT_OK, result());
        }
        finish();
    }

    private Intent result() {
        return new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
    }
}
