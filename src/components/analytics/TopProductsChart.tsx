import type { RankedItem } from '../../services/admin/AnalyticsService';
import HorizontalBarChart from './HorizontalBarChart';

interface Props {
    data: RankedItem[];
}

export default function TopProductsChart({ data }: Props) {
    return (
        <HorizontalBarChart
            title="Produtos mais consultados"
            badge="consultas de preço"
            data={data}
            color="#0f7b6c"
            emptyMessage="Nenhuma consulta de preço registrada ainda."
        />
    );
}
