import humanizeString = require('humanize-string');
import { Range } from 'vscode';
import { getConfig } from '../configuration';
import { translateManager } from '../extension';
import { hasEndMark, isLowerCase, isUpperCase } from '../util/string';

export interface ICommentBlock {
  humanize?: boolean;
  range: Range;
  comment: string;
  tokens?: ICommentToken[];
}

export interface ICommentToken {
  ignoreStart?: number;
  ignoreEnd?: number;
  text: string;
  scope: IScopeLen[];
}

interface IScopeLen {
  scopes: string[];
  len: number;
}

export interface ITranslatedText {
  translatedText: string;
  humanizeText?: string;
  translateLink: string;
}

function ignoreStringTag(tokens: ICommentToken[], regular: string) {
  // const regular = '[\\*\\s]+';
  if (regular) {
    return tokens.map((item) => {
      let { ignoreStart = 0, ignoreEnd = 0, text } = item;
      const validText = text.slice(ignoreStart, text.length - ignoreEnd);
      let match = validText.match('^' + regular);
      if (match && match.length) {
        ignoreStart += match[0].length;
      }
      item.ignoreStart = ignoreStart;
      return item;
    });
  }
  return tokens;
}

function humanize(originText: string) {
  const needHumanize = originText.trim().indexOf(' ') < 0;
  if (needHumanize) {
    // 转换为可以自然语言分割
    return humanizeString(originText);
  }
  return '';
}

function combineLine(texts: string[]) {
  let combined: boolean[] = []; // 标记被合并行。 便于翻译后重新组合
  let combinedTexts = texts.reduce<string[]>((prev, curr, index) => {
    let lastIndex = combined.lastIndexOf(false);
    combined[index] = false;
    if (prev.length > 0) {
      let last = prev[lastIndex];
      if (isUpperCase(last) && hasEndMark(last) && isLowerCase(curr)) {
        // 如果可以合并，合并到上一行
        prev[lastIndex] = last + ' ' + curr;
        //当前行空掉，但是保留空白占位符
        curr = '';
        combined[index] = true;
      }
    }
    prev.push(curr);
    return prev;
  }, []);

  return { combined, combinedTexts };
}

function getIgnoreRegular(languageId: string) {
  const ignore = getConfig<{ languageId: string; regular: string }[]>('ignore');
  if (!ignore) return '';
  let { regular = '' } =
    ignore.find((item) => {
      return item.languageId
        .split(',')
        .some((text) => text.trim() === languageId);
    }) || {};
  return regular;
}

export async function compileBlock(
  block: ICommentBlock,
  languageId: string,
  targetLanguage?: string
): Promise<ITranslatedText> {
  let translatedText: string = '';
  let humanizeText: string = '';
  const { comment: originText } = block;
  let { tokens } = block;

  // targetLanguage = targetLanguage || getConfig<string>('targetLanguage', userLanguage);
  if (!tokens) {
    // 选取翻译&单个单词翻译的时候。无tokens的简单结果
    humanizeText = humanize(originText);
    if (humanizeText) {
      translatedText = await translateManager.translate(
        humanizeText || originText,
        { to: targetLanguage }
      );
    }
  }

  return {
    translatedText,
    humanizeText,
    translateLink: translateManager.link(humanizeText || originText),
  };
}
