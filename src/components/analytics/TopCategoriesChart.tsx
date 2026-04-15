import type { RankedItem } from '../../services/admin/AnalyticsService';
import HorizontalBarChart from './HorizontalBarChart';

interface Props {
    data: RankedItem[];
}

export default function TopCategoriesChart({ data }: Props) {
    return (
        <HorizontalBarChart
            title="Top categorias"
            badge="compras registradas"
            data={data}
            color="#0b6b5e"
            emptyMessage="Nenhuma compra registrada ainda."
        />
    );
}
