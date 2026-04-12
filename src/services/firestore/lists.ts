import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";

export type ListItem = { name: string; qty: number };

export async function saveList(params: {
  deviceId: string;
  name: string;
  items: ListItem[];
}) {
  const docRef = await addDoc(collection(db, "lists"), {
    deviceId: params.deviceId,
    name: params.name,
    items: params.items,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}