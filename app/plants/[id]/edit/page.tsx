import { PlantEditPage } from "@/components/PlantEditPage";

export default function EditPlantRoute({ params }: { params: { id: string } }) {
  return <PlantEditPage plantId={params.id} />;
}
