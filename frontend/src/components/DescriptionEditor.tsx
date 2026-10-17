import { Editor, type EditorInstance } from '@open-ent/react/editor';

/**
 * Éditeur riche de la description d'une ressource (même composant du socle que l'AngularJS `<editor>`).
 *
 * Contenu initial : une chaîne VIDE fait planter l'éditeur (erreur React #321 levée depuis son paquet) ; on lui
 * passe un paragraphe vide. Importé directement et non en `lazy` : suspendre dans une fenêtre modale du socle
 * lève la même erreur (cf. module calendar). Le formulaire de ressource est une page, pas une modale.
 */
const initialContent = (content: string): string => (content && content.trim() ? content : '<p></p>');

export function DescriptionEditor({ id, content, onChange }: { id?: string; content: string; onChange: (html: string) => void }) {
  return (
    <Editor
      id={id}
      content={initialContent(content)}
      mode="edit"
      focus={false}
      variant="outline"
      visibility="protected"
      onContentChange={({ editor }: { editor: EditorInstance }) => onChange(editor.isEmpty ? '' : editor.getHTML())}
    />
  );
}

export default DescriptionEditor;
