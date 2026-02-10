import ConvoClient from "./ConvoClient";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConvoClient id={id} />;
}

