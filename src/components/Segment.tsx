/**
 * 가로 세그먼트 선택. 지출/수입/이체/정산 처럼 몇 개 안 되는 값을 고를 때.
 * 버튼 높이는 터치 최소 44px 를 지킨다.
 */
export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 선택됐을 때 색. 지출은 빨강, 수입은 파랑처럼 구분하고 싶을 때 */
  activeClassName?: string;
}

export function Segment<T extends string>({
  options,
  value,
  onChange,
  activeClassName = 'bg-white text-slate-900 shadow-sm',
}: SegmentProps<T>) {
  return (
    <div role="tablist" className="flex gap-1 rounded-xl bg-slate-100 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`min-h-11 flex-1 rounded-lg text-sm font-medium transition-colors ${
              active ? activeClassName : 'text-slate-500 active:bg-slate-200'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
