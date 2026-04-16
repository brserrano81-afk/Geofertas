import type { RankedItem } from '../../services/admin/AnalyticsService';
import HorizontalBarChart from './HorizontalBarChart';

interface Props {
    data: RankedItem[];
}

export default function RegionConsumptionMap({ data }: Props) {
    return (
        <HorizontalBarChart
            data={data}
            emptyMessage="Nenhuma região identificada ainda."
        />
    );
}
