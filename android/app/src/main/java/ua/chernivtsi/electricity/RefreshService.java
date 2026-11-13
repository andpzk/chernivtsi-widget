package ua.chernivtsi.electricity;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public final class RefreshService extends JobService {
    private static final int PERIODIC = 1;
    private static final int NOW = 2;
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final class Run {
        Future<?> task;
    }

    private final Map<Integer, Run> running = new HashMap<>();
    private final Handler main = new Handler(Looper.getMainLooper());

    static void schedule(Context context, boolean now) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (PowerWidget.activeIds(context).isEmpty()) {
            scheduler.cancel(PERIODIC);
            scheduler.cancel(NOW);
            return;
        }
        ComponentName service = new ComponentName(context, RefreshService.class);
        if (scheduler.getPendingJob(PERIODIC) == null) {
            scheduler.schedule(new JobInfo.Builder(PERIODIC, service).setPersisted(true)
                    .setPeriodic(15 * 60_000L).build());
            now = true;
        }
        if (now) scheduler.schedule(new JobInfo.Builder(NOW, service).setOverrideDeadline(0).build());
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        int jobId = params.getJobId();
        Run run = new Run();
        running.put(jobId, run);
        run.task = EXECUTOR.submit(() -> {
            try {
                Set<Integer> groups = new LinkedHashSet<>();
                for (int id : PowerWidget.activeIds(this)) {
                    int group = PowerWidget.group(this, id);
                    if (group >= 1 && group <= 12) groups.add(group);
                }
                if (!groups.isEmpty()) {
                    new DesignStore(this).refresh();
                    new ScheduleStore(this).refresh(groups);
                }
            } catch (RuntimeException e) {
                Log.w("ChernivtsiSchedule", "Widget refresh failed", e);
            } finally {
                if (!Thread.currentThread().isInterrupted()) main.post(() -> {
                    if (running.get(jobId) != run) return;
                    running.remove(jobId);
                    try {
                        for (int id : PowerWidget.activeIds(this)) PowerWidget.show(this, id, false);
                    } finally {
                        jobFinished(params, false);
                    }
                });
            }
        });
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        Run run = running.remove(params.getJobId());
        if (run != null) run.task.cancel(true);
        return false;
    }
}
