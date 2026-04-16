import type { RankedItem } from '../../services/admin/AnalyticsService';
import HorizontalBarChart from './HorizontalBarChart';

interface Props {
    data: RankedItem[];
}

export default function MarketRankingChart({ data }: Props) {
    return (
        <HorizontalBarChart
            title=""
            data={data}
            emptyMessage="Nenhum mercado identificado ainda."
        />
    );
}
