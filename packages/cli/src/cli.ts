import { Command } from 'commander';
import packageMetadata from '../package.json';
import { registerApplyCommand } from './commands/apply';
import { registerCleanCommand } from './commands/clean';
import { registerCodexSupportBoundariesCommand } from './commands/codexSupportBoundaries';
import { registerExportCopilotMcpCommand } from './commands/exportCopilotMcp';
import { registerExportPackageMarketplaceCommand } from './commands/exportPackageMarketplace';
import { registerInitCommand } from './commands/init';
import { registerPreviewCommand } from './commands/preview';
import { registerProfileCommand } from './commands/profile';
import { registerPromoteCommand } from './commands/promote';
import { registerStatusCommand } from './commands/status';
import { registerTargetSupportCommand } from './commands/targetSupport';
import { registerValidateCommand } from './commands/validate';
import { registerWatchCommand } from './commands/watch';

/**
 * Create and configure the MetaFlow CLI program.
 * Exported for programmatic use and testing.
 */
export function createProgram(): Command {
    const program = new Command();

    program
        .name('metaflow')
        .description('MetaFlow CLI — AI metadata overlay management')
        .version(packageMetadata.version)
        .option('-w, --workspace <path>', 'Workspace root directory', process.cwd());

    registerStatusCommand(program);
    registerPreviewCommand(program);
    registerApplyCommand(program);
    registerCleanCommand(program);
    registerExportCopilotMcpCommand(program);
    registerExportPackageMarketplaceCommand(program);
    registerTargetSupportCommand(program);
    registerCodexSupportBoundariesCommand(program);
    registerProfileCommand(program);
    registerPromoteCommand(program);
    registerValidateCommand(program);
    registerWatchCommand(program);
    registerInitCommand(program);

    return program;
}

// Run when invoked directly
if (require.main === module) {
    createProgram().parse();
}
