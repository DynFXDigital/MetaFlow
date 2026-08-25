export interface ConfigurationChangeLike<TResource> {
    affectsConfiguration(section: string, resource?: TResource): boolean;
}

export function affectsWorkspaceConfiguration<TResource>(
    event: ConfigurationChangeLike<TResource>,
    section: string,
    resource: TResource | undefined,
): boolean {
    return (
        event.affectsConfiguration(section) ||
        (resource !== undefined && event.affectsConfiguration(section, resource))
    );
}
