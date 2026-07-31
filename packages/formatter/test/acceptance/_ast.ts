/**
 * AST equality modulo positions (acceptance criterion 2).
 *
 * A signature rather than a deep compare: spans move by definition, whitespace-only text is
 * exactly what a formatter rewrites, and a delegated JS fragment comes back with the leaf
 * formatter's own idea of quotes and semicolons. What must not move is everything else —
 * the shape of the tree, the tags, the attribute names, the words of the text, and the kind
 * and the ORDER of the Razor atoms.
 *
 * What this deliberately does not check is that the JS means the same thing. That is the
 * leaf formatter's contract, and the test that would catch it breaking is the emit
 * equivalence of criterion 3, which executes the code rather than reading it.
 */

import {
  parseCodeBlock,
  parseControl,
  parseDirective,
  parseDocument,
  type AtConstructParser,
  type Attribute,
  type CodeBlockNode,
  type ForeachNode,
  type HtmlContent,
  type IfNode,
  type SectionNode,
  type SwitchNode,
} from '@fudic/compiler';

const constructs: AtConstructParser = { parseControl, parseCodeBlock, parseDirective };

const asIf = (node: HtmlContent): IfNode => node as unknown as IfNode;
const asLoop = (node: HtmlContent): ForeachNode => node as unknown as ForeachNode;
const asSwitch = (node: HtmlContent): SwitchNode => node as unknown as SwitchNode;
const asCode = (node: HtmlContent): CodeBlockNode => node as unknown as CodeBlockNode;
const asSection = (node: HtmlContent): SectionNode => node as unknown as SectionNode;

function attributeSignature(attribute: Attribute, out: string[]): void {
  const name = typeof attribute.name === 'string' ? attribute.name : '(expr)';
  out.push(`attr:${name}`);
  for (const part of attribute.value) {
    out.push(part.type === 'attribute-text' ? `value:${part.value}` : `value:@${part.kind}`);
  }
}

function signatureOf(nodes: readonly HtmlContent[], out: string[]): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'element': {
        out.push(`<${node.name}:${node.kind}`);
        for (const attribute of node.attributes) attributeSignature(attribute, out);
        signatureOf(node.children, out);
        out.push(`</${node.name}`);
        break;
      }
      case 'text': {
        // Whitespace-only text is a run, and rewriting runs is the job. Words are content.
        const words = node.value.trim().split(/\s+/).filter(Boolean);
        if (words.length > 0) out.push(`text:${words.join(' ')}`);
        break;
      }
      case 'razor-expression':
        out.push(`expr:${node.kind}`);
        break;
      case 'style-content':
        out.push(`style:${node.parts.map((p) => p.type).join(',')}`);
        break;
      case 'raw-text':
        // Opaque: byte for byte, so the bytes ARE the signature.
        out.push(`raw:${node.value}`);
        break;
      case 'comment':
        out.push(`comment:${node.value}`);
        break;
      case 'if': {
        const branch = asIf(node);
        out.push(`if:${branch.branches.length}:${branch.elseBody === undefined ? 0 : 1}`);
        for (const arm of branch.branches) signatureOf(arm.body, out);
        signatureOf(branch.elseBody ?? [], out);
        break;
      }
      case 'foreach':
      case 'for':
      case 'while':
        out.push(node.type);
        signatureOf(asLoop(node).body, out);
        break;
      case 'switch': {
        const node_ = asSwitch(node);
        out.push(`switch:${node_.cases.length}`);
        for (const branch of node_.cases) {
          out.push(branch.test === undefined ? 'default' : 'case');
          signatureOf(branch.body, out);
        }
        break;
      }
      case 'code':
        out.push(`code:${asCode(node).parts.map((p) => p.type).join(',')}`);
        break;
      case 'section':
        out.push(`section:${asSection(node).name}`);
        signatureOf(asSection(node).children, out);
        break;
      default:
        out.push(node.type);
        break;
    }
  }
}

/** The signature of a `.fud` source: what the formatter is not allowed to change. */
export function astSignature(source: string): readonly string[] {
  const out: string[] = [];
  signatureOf(parseDocument(source, { atConstructs: constructs }).value.children, out);
  return out;
}
