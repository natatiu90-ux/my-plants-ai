import { PlantDetailScreen } from "@/components/PlantDetailScreen";

export default function PlantDetailPage({ params }: { params: { id: string } }) {
  return <PlantDetailScreen plantId={params.id} />;
}
