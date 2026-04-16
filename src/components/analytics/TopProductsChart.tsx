import type { RankedItem } from '../../services/admin/AnalyticsService';
import HorizontalBarChart from './HorizontalBarChart';

interface Props {
    data: RankedItem[];
}

export default function TopProductsChart({ data }: Props) {
    return (
        <HorizontalBarChart
            data={data}
            emptyMessage="Nenhum produto consultado ainda."
        />
    );
}
