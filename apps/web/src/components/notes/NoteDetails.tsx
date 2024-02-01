'use client';

import { api, useQuery } from '@notes/db';
import { Id } from '@notes/db/convex/_generated/dataModel';

interface NoteDetailsProps {
  noteId: Id<'notes'>;
}

const NoteDetails = ({ noteId }: NoteDetailsProps) => {
  const currentNote = useQuery(api.notes.getNote, { id: noteId });

  return (
    <div className="container space-y-6 sm:space-y-9 py-20 px-[26px] sm:px-0">
      <h3 className="text-black text-center pb-5 text-xl sm:text-[32px] not-italic font-semibold leading-[90.3%] tracking-[-0.8px]">
        {currentNote?.title}
      </h3>
      <p className="text-black text-xl sm:text-[28px] not-italic font-normal leading-[130.3%] tracking-[-0.7px]">
        {currentNote?.content}
      </p>
    </div>
  );
};

export default NoteDetails;
