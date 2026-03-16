declare module 'markdown-it' {
    export interface MarkdownItOptions {
        html?: boolean;
        linkify?: boolean;
        typographer?: boolean;
    }

    export interface MarkdownToken {
        attrGet(name: string): string | null;
        attrSet(name: string, value: string): void;
    }

    export interface RendererLike {
        rules: Record<string, RenderRule | undefined>;
        renderToken(tokens: MarkdownToken[], index: number, options: unknown): string;
    }

    export type RenderRule = (
        tokens: MarkdownToken[],
        index: number,
        options: unknown,
        env: unknown,
        self: RendererLike,
    ) => string;

    export default class MarkdownIt {
        constructor(options?: MarkdownItOptions);
        renderer: RendererLike;
        validateLink: (url: string) => boolean;
        disable(rules: string[]): this;
        render(source: string): string;
    }
}
