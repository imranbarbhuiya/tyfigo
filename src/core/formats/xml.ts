import { parseXml, XmlElement, XmlError, XmlText } from '@rgrove/parse-xml';

import { inferScalar, ParseContext } from './format.ts';

import type { Path } from '../positions.ts';
import type { Format, ParseResult } from './format.ts';

type Range = readonly [number, number];

const isNameEnd = (char: string | undefined) => char === undefined || /[\s=/>]/u.test(char);

const isWhitespace = (text: string) => /^[\t\n\r ]*$/u.test(text);

interface StartTag {
	readonly name: Range;
	readonly attributes: ReadonlyMap<string, { readonly name: Range; readonly value: Range }>;
	readonly end: number;
}

/**
 * Reads the ranges of an element's name and attributes from its start tag, which the parser has already checked.
 */
const startTag = (text: string, element: XmlElement): StartTag => {
	let index = element.start + 1;
	const name: Range = [index, index + element.name.length];
	index = name[1];
	const attributes = new Map<string, { name: Range; value: Range }>();
	for (;;) {
		while (/\s/u.test(text[index] ?? '')) index++;
		if (text[index] === '>' || text[index] === '/' || index >= element.end) break;
		const nameStart = index;
		while (!isNameEnd(text[index])) index++;
		const attribute: Range = [nameStart, index];
		while (text[index] !== '"' && text[index] !== "'") index++;
		const close = text.indexOf(text[index]!, index + 1);
		attributes.set(text.slice(...attribute), { name: attribute, value: [index, close + 1] });
		index = close + 1;
	}
	return { name, attributes, end: text.indexOf('>', index) + 1 };
};

class XmlWalker {
	readonly context: ParseContext;
	readonly text: string;

	constructor(context: ParseContext) {
		this.context = context;
		this.text = context.source.text;
	}

	/**
	 * The value of an element: a scalar for an element with only text, otherwise an object with `@name` attributes, `#text`
	 * and child elements, where a repeated child element becomes an array.
	 */
	element(element: XmlElement, path: Path, key: (tag: StartTag) => Range): unknown {
		const tag = startTag(this.text, element);
		const children = element.children.filter((child) => child instanceof XmlElement);
		const texts = element.children.filter(
			(child): child is XmlText => child instanceof XmlText && !isWhitespace(child.text),
		);
		if (tag.attributes.size === 0 && children.length === 0) {
			const selfClosing = this.text[tag.end - 2] === '/';
			const content: Range = [tag.end, this.text.lastIndexOf('</', element.end - 1)];
			this.context.add(path, key(tag), selfClosing ? [element.start, element.end] : content);
			return inferScalar(element.text);
		}

		this.context.add(path, key(tag), [element.start, element.end]);
		const value: Record<string, unknown> = {};
		for (const [name, attribute] of tag.attributes) {
			this.context.add([...path, `@${name}`], attribute.name, attribute.value);
			value[`@${name}`] = inferScalar(element.attributes[name] ?? '');
		}

		if (texts.length > 0) {
			const range: Range = [texts[0]!.start, texts.at(-1)!.end];
			this.context.add([...path, '#text'], range, range);
			value['#text'] = inferScalar(texts.map((text) => text.text).join(''));
		}

		const groups = Map.groupBy(children, (child) => child.name);
		for (const [name, group] of groups) {
			const childPath = [...path, name];
			if (group.length === 1) {
				value[name] = this.element(group[0]!, childPath, (child) => child.name);
				continue;
			}

			const first = startTag(this.text, group[0]!);
			this.context.add(childPath, first.name, [group[0]!.start, group.at(-1)!.end]);
			value[name] = group.map((child, index) => this.element(child, [...childPath, index], (item) => item.name));
		}
		return value;
	}
}

const markup = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>/gu;

const parse = (text: string, file = ''): ParseResult => {
	const context = new ParseContext(text, file);
	if (isWhitespace(text.replaceAll(markup, ''))) {
		context.add([], [0, 0], [0, 0]);
		return context.result({});
	}

	let root: XmlElement;
	try {
		const document = parseXml(text, { includeOffsets: true });
		root = document.root!;
	} catch (error) {
		if (!(error instanceof XmlError)) throw error;
		const message = error.message.split('\n')[0]!.replace(/ \(line \d+, column \d+\)$/u, '');
		context.problem([error.pos, error.pos + 1], 'parse-error', message);
		return context.result(undefined);
	}

	context.add([], [root.start, root.end], [root.start, root.end]);
	const value = new XmlWalker(context).element(root, [root.name], (tag) => tag.name);
	return context.result({ [root.name]: value });
};

export const xml: Format = { name: 'xml', parse, parseScalar: inferScalar };
