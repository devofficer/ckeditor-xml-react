import { useEffect, useState } from 'react';
import _ from 'lodash';
import xmlFormat from 'xml-formatter';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import { ClassicEditor } from '@ckeditor/ckeditor5-editor-classic';
import { Essentials } from '@ckeditor/ckeditor5-essentials';
import { SourceEditing } from '@ckeditor/ckeditor5-source-editing';
import NativeXmlDataProcessor from '@ckeditor/ckeditor5-engine/src/dataprocessor/xmldataprocessor';
import { type Editor } from '@ckeditor/ckeditor5-core';
import { UpcastWriter, type ViewDocumentFragment } from '@ckeditor/ckeditor5-engine';
import { GeneralHtmlSupport } from '@ckeditor/ckeditor5-html-support';
import CKNode from '@ckeditor/ckeditor5-engine/src/view/node';
import CKElement from '@ckeditor/ckeditor5-engine/src/view/element';

class XmlDataProcessor extends NativeXmlDataProcessor {
  editor: Editor;

  constructor(editor: Editor) {
    super(editor.editing.view.document);

    this.editor = editor;
  }

  toView(data: string): ViewDocumentFragment {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(data, 'text/xml');

    const viewDocument = this.editor.editing.view.document;
    const upcastWriter = new UpcastWriter(viewDocument);
    const container = upcastWriter.createElement('div', {
      node: 'container',
      prefix: `<?xml version="1.0" ?><?xml-stylesheet href="bgt-typo.style" type="text/x-styler" media="editor" alternate="yes"?>`,
    });
    const viewFragment = upcastWriter.createDocumentFragment([container]);

    const processNode = (node: Element, parent: CKElement) => {
      if (!node || ['a:Num'].includes(node.nodeName)) {
        return;
      }

      if (node.nodeType === Node.TEXT_NODE && !_.isEmpty((node.textContent || '').trim())) {
        const text = upcastWriter.createText((node.textContent || '').trim());
        upcastWriter.appendChild(text, parent);
        return;
      }

      const childNodes = Array.from(node.childNodes).filter(
        (child) => child.nodeType !== Node.TEXT_NODE || !_.isEmpty((child.textContent || '').trim()),
      );

      const attributes: { [key: string]: string } = { node: node.nodeName };
      if (node.attributes?.length > 0) {
        Array.from(node.attributes).forEach((attr) => (attributes[attr.name] = attr.value));
      }

      if (childNodes.length === 1 && childNodes[0].nodeType === Node.TEXT_NODE) {
        const p = upcastWriter.createElement('p', attributes);
        upcastWriter.appendChild(p, parent);

        processNode(childNodes[0] as Element, p);
        return;
      }

      if (Array.from(childNodes).some((child) => child.nodeName === 'a:Num')) {
        const li = upcastWriter.createElement('li', attributes);

        console.log(Array.from(parent.getChildren()).length > 0 && Array.from(parent.getChildren()));
        let ol = Array.from(parent.getChildren()).find((child) => (child as CKElement).name === 'ol') as CKElement;
        if (!ol) {
          ol = upcastWriter.createElement('ol', { node: parent.getAttribute('node') + '-ol' });
          upcastWriter.appendChild(ol, parent);
        }

        upcastWriter.appendChild(li, ol);
        childNodes.forEach((child) => processNode(child as Element, li));
        return;
      }

      const div = upcastWriter.createElement('div', attributes);
      upcastWriter.appendChild(div, parent);

      childNodes.forEach((child) => processNode(child as Element, div));
    };

    processNode(xmlDoc.childNodes[1] as Element, container);

    return viewFragment;
  }

  toData(viewFragment: ViewDocumentFragment): string {
    const processViewNode = (viewNode: CKNode): string => {
      if (viewNode.is('$text')) {
        return viewNode.data;
      } else if (viewNode.is('element')) {
        const nodeName = viewNode.getAttribute('node') as string;
        const attributes = Array.from(viewNode.getAttributes())
          .filter(([key]) => key !== 'node')
          .map(([key, value]) => `${key}="${value}"`)
          .join(' ');

        if (nodeName) {
          const content = Array.from(viewNode.getChildren())
            .map((node) => processViewNode(node))
            .join('');

          if (nodeName === 'container') {
            const prefix = viewNode.getAttribute('prefix');
            return prefix + content;
          } else if (viewNode.name === 'li') {
            return `<${nodeName} ${attributes}><a:Num numero="${(viewNode.index || 0) + 1}"/>${content}</${nodeName}>`;
          } else if (nodeName.endsWith('-ol')) {
            return content;
          }

          return `<${nodeName} ${attributes}>${content}</${nodeName}>`;
        }
      }

      return '';
    };

    const str = processViewNode(viewFragment.getChild(0)) || '<tag>content</tag>';

    return xmlFormat(str);
  }
}

function XmlPlugin(editor: Editor) {
  editor.on('ready', () => {
    editor.data.processor = new XmlDataProcessor(editor);

    editor.model.schema.extend('htmlLi', {
      allowChildren: ['htmlOl', 'htmlDiv', 'htmlP'],
    });
  });
}

function App() {
  const [xmlData, setXmlData] = useState<string>('<tag>content</tag>');

  useEffect(() => {
    const fetchXmlData = async () => {
      fetch('/test.xml').then(async (res) => {
        setXmlData(await res.text());
      });
    };

    fetchXmlData();
  }, []);

  return (
    <CKEditor
      editor={ClassicEditor}
      config={{
        plugins: [Essentials, SourceEditing, GeneralHtmlSupport, XmlPlugin],
        toolbar: ['sourceEditing', 'exportXml'],
        htmlSupport: {
          allow: [
            {
              name: /.*/,
              attributes: true,
              classes: true,
              styles: true,
            },
          ],
        },
      }}
      data={xmlData}
    />
  );
}

export default App;
