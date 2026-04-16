import type { RankedItem } from '../../services/admin/AnalyticsService';
import HorizontalBarChart from './HorizontalBarChart';

interface Props {
    data: RankedItem[];
}

export default function TopCategoriesChart({ data }: Props) {
    return (
        <HorizontalBarChart
            title=""
            data={data}
            emptyMessage="Nenhuma categoria registrada ainda."
        />
    );
}
