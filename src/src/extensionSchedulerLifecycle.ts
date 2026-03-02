export interface DisposableLike {
    dispose(): void;
}

export interface RepoUpdateSchedulerLifecycleDeps {
    workspaceHasConfig: () => boolean;
    createScheduler: () => DisposableLike;
    onStarted?: () => void;
    onStopped?: () => void;
}

export interface RepoUpdateSchedulerLifecycleController extends DisposableLike {
    sync(): void;
}

export function createRepoUpdateSchedulerLifecycleController(
    deps: RepoUpdateSchedulerLifecycleDeps
): RepoUpdateSchedulerLifecycleController {
    let schedulerDisposable: DisposableLike | undefined;

    const sync = (): void => {
        const hasConfig = deps.workspaceHasConfig();
        if (hasConfig && !schedulerDisposable) {
            schedulerDisposable = deps.createScheduler();
            deps.onStarted?.();
            return;
        }

        if (!hasConfig && schedulerDisposable) {
            schedulerDisposable.dispose();
            schedulerDisposable = undefined;
            deps.onStopped?.();
        }
    };

    const dispose = (): void => {
        if (!schedulerDisposable) {
            return;
        }

        schedulerDisposable.dispose();
        schedulerDisposable = undefined;
        deps.onStopped?.();
    };

    return { sync, dispose };
}
