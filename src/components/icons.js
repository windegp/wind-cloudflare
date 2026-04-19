// SVG Icons Component Library — Full Lucide-standard rewrite
// All paths are complete with no truncation. Every icon uses the standard
// Lucide props: fill="none" stroke="currentColor" strokeWidth={2}
// strokeLinecap="round" strokeLinejoin="round"

const iconBase = (size, className, props) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className,
  ...props,
});

export const Star = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

export const Heart = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 19 14 c 1.49 -1.46 3 -3.21 3 -5.5 A 5.5 5.5 0 0 0 16.5 3 c -1.76 0 -3 0.5 -4.5 2 c -1.5 -1.5 -2.74 -2 -4.5 -2 A 5.5 5.5 0 0 0 2 8.5 c 0 2.3 1.505 4.046 3 5.5 L 12 21 l 7 -7 Z" />
  </svg>
);

export const ChevronRight = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 9 18 l 6 -6 -6 -6" />
  </svg>
);

export const ChevronLeft = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 15 18 l -6 -6 6 -6" />
  </svg>
);

export const ChevronDown = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 6 9 l 6 6 6 -6" />
  </svg>
);

export const ChevronUp = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 18 15 l -6 -6 -6 6" />
  </svg>
);

export const Eye = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 2 12 s 3 -7 10 -7 s 10 7 10 7 s -3 7 -10 7 s -10 -7 -10 -7 Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const EyeOff = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 9.88 9.88 a 3 3 0 1 0 4.24 4.24" />
    <path d="M 10.73 5.08 A 10.43 10.43 0 0 1 12 5 c 7 0 10 7 10 7 a 13.16 13.16 0 0 1 -1.67 2.68" />
    <path d="M 6.61 6.61 A 13.526 13.526 0 0 0 2 12 s 3 7 10 7 a 9.74 9.74 0 0 0 5.39 -1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

export const Plus = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const Minus = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const X = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const Menu = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="18" x2="20" y2="18" />
  </svg>
);

export const Search = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export const ShoppingCart = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <circle cx="8" cy="21" r="1" />
    <circle cx="19" cy="21" r="1" />
    <path d="M 2.05 2.05 h 2 l 2.66 12.42 a 2 2 0 0 0 2 1.58 h 9.78 a 2 2 0 0 0 1.95 -1.57 l 1.65 -7.43 H 5.12" />
  </svg>
);

export const ShoppingBag = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 6 2 L 3 6 v 14 a 2 2 0 0 0 2 2 h 14 a 2 2 0 0 0 2 -2 V 6 l -3 -4 Z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M 16 10 a 4 4 0 0 1 -8 0" />
  </svg>
);

export const User = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M 20 21 a 8 8 0 1 0 -16 0" />
  </svg>
);

export const Users = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 16 21 v -2 a 4 4 0 0 0 -4 -4 H 6 a 4 4 0 0 0 -4 4 v 2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M 22 21 v -2 a 4 4 0 0 0 -3 -3.87" />
    <path d="M 16 3.13 a 4 4 0 0 1 0 7.75" />
  </svg>
);

export const Filter = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

export const Grid = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </svg>
);

export const List = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

export const Trash2 = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 3 6 h 18" />
    <path d="M 19 6 v 14 c 0 1 -1 2 -2 2 H 7 c -1 0 -2 -1 -2 -2 V 6" />
    <path d="M 8 6 V 4 c 0 -1 1 -2 2 -2 h 4 c 1 0 2 1 2 2 v 2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

export const Edit = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 11 4 H 4 a 2 2 0 0 0 -2 2 v 14 a 2 2 0 0 0 2 2 h 14 a 2 2 0 0 0 2 -2 v -7" />
    <path d="M 18.5 2.5 a 2.121 2.121 0 0 1 3 3 L 12 15 l -4 1 1 -4 9.5 -9.5 z" />
  </svg>
);

export const Copy = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M 5 15 H 4 a 2 2 0 0 1 -2 -2 V 4 a 2 2 0 0 1 2 -2 h 9 a 2 2 0 0 1 2 2 v 1" />
  </svg>
);

export const Move = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <polyline points="5 9 2 12 5 15" />
    <polyline points="9 5 12 2 15 5" />
    <polyline points="15 19 12 22 9 19" />
    <polyline points="19 9 22 12 19 15" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="12" y1="2" x2="12" y2="22" />
  </svg>
);

export const GripVertical = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <circle cx="9" cy="5" r="1" fill="currentColor" />
    <circle cx="9" cy="12" r="1" fill="currentColor" />
    <circle cx="9" cy="19" r="1" fill="currentColor" />
    <circle cx="15" cy="5" r="1" fill="currentColor" />
    <circle cx="15" cy="12" r="1" fill="currentColor" />
    <circle cx="15" cy="19" r="1" fill="currentColor" />
  </svg>
);

export const ArrowRight = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

export const ArrowLeft = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

export const ArrowUp = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

export const ArrowDown = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="19 12 12 19 5 12" />
  </svg>
);

export const Package = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 16.5 9.4 L 7.55 4.24" />
    <path d="M 21 16 V 8 a 2 2 0 0 0 -1 -1.73 l -7 -4 a 2 2 0 0 0 -2 0 l -7 4 A 2 2 0 0 0 3 8 v 8 a 2 2 0 0 0 1 1.73 l 7 4 a 2 2 0 0 0 2 0 l 7 -4 A 2 2 0 0 0 21 16 z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

export const Mail = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m 22 7 l -8.97 5.7 a 1.94 1.94 0 0 1 -2.06 0 L 2 7" />
  </svg>
);

export const Phone = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 22 16.92 v 3 a 2 2 0 0 1 -2.18 2 a 19.79 19.79 0 0 1 -8.63 -3.07 A 19.5 19.5 0 0 1 4.69 12 a 19.79 19.79 0 0 1 -3.07 -8.67 A 2 2 0 0 1 3.62 1.27 h 3 a 2 2 0 0 1 2 1.72 a 12.84 12.84 0 0 0 0.7 2.81 a 2 2 0 0 1 -0.45 2.11 L 8.09 9.91 a 16 16 0 0 0 6 6 l 1.27 -1.27 a 2 2 0 0 1 2.11 -0.45 a 12.84 12.84 0 0 0 2.81 0.7 A 2 2 0 0 1 22 16.92 z" />
  </svg>
);

export const MapPin = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 20 10 c 0 6 -8 12 -8 12 s -8 -6 -8 -12 a 8 8 0 0 1 16 0 Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export const Calendar = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

export const Clock = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

export const Check = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const CheckCircle = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 22 11.08 V 12 a 10 10 0 1 1 -5.93 -9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

export const AlertCircle = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

export const AlertTriangle = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 10.29 3.86 L 1.82 18 a 2 2 0 0 0 1.71 3 h 16.94 a 2 2 0 0 0 1.71 -3 L 13.71 3.86 a 2 2 0 0 0 -3.42 0 z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export const Info = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

export const Loader2 = ({ className, size = 24, ...props }) => (
  <svg
    {...iconBase(size, className, props)}
    className={`animate-spin${className ? ` ${className}` : ""}`}
  >
    <path d="M 21 12 a 9 9 0 1 1 -6.219 -8.56" />
  </svg>
);

export const Save = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 19 21 H 5 a 2 2 0 0 1 -2 -2 V 5 a 2 2 0 0 1 2 -2 h 11 l 5 5 v 11 a 2 2 0 0 1 -2 2 z" />
    <polyline points="17 21 17 13 7 13" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

export const Settings = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M 19.4 15 a 1.65 1.65 0 0 0 0.33 1.82 l 0.06 0.06 a 2 2 0 0 1 -2.83 2.83 l -0.06 -0.06 a 1.65 1.65 0 0 0 -1.82 -0.33 a 1.65 1.65 0 0 0 -1 1.51 V 21 a 2 2 0 0 1 -4 0 v -0.09 A 1.65 1.65 0 0 0 9 19.4 a 1.65 1.65 0 0 0 -1.82 0.33 l -0.06 0.06 a 2 2 0 0 1 -2.83 -2.83 l 0.06 -0.06 A 1.65 1.65 0 0 0 4.68 15 a 1.65 1.65 0 0 0 -1.51 -1 H 3 a 2 2 0 0 1 0 -4 h 0.09 A 1.65 1.65 0 0 0 4.6 9 a 1.65 1.65 0 0 0 -0.33 -1.82 l -0.06 -0.06 a 2 2 0 0 1 2.83 -2.83 l 0.06 0.06 A 1.65 1.65 0 0 0 9 4.68 a 1.65 1.65 0 0 0 1 -1.51 V 3 a 2 2 0 0 1 4 0 v 0.09 a 1.65 1.65 0 0 0 1 1.51 a 1.65 1.65 0 0 0 1.82 -0.33 l 0.06 -0.06 a 2 2 0 0 1 2.83 2.83 l -0.06 0.06 A 1.65 1.65 0 0 0 19.4 9 a 1.65 1.65 0 0 0 1.51 1 H 21 a 2 2 0 0 1 0 4 h -0.09 a 1.65 1.65 0 0 0 -1.51 1 z" />
  </svg>
);

export const Home = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 3 9 l 9 -7 9 7 v 11 a 2 2 0 0 1 -2 2 H 5 a 2 2 0 0 1 -2 -2 z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

export const Link = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 10 13 a 5 5 0 0 0 7.54 0.54 l 3 -3 a 5 5 0 0 0 -7.07 -7.07 l -1.72 1.71" />
    <path d="M 14 11 a 5 5 0 0 0 -7.54 -0.54 l -3 3 a 5 5 0 0 0 7.07 7.07 l 1.71 -1.71" />
  </svg>
);

export const ExternalLink = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 18 13 v 6 a 2 2 0 0 1 -2 2 H 5 a 2 2 0 0 1 -2 -2 V 8 a 2 2 0 0 1 2 -2 h 6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

export const Upload = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 21 15 v 4 a 2 2 0 0 1 -2 2 H 5 a 2 2 0 0 1 -2 -2 v -4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

export const Download = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 21 15 v 4 a 2 2 0 0 1 -2 2 H 5 a 2 2 0 0 1 -2 -2 v -4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export const Image = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

export const Tag = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 20.59 13.41 l -7.17 7.17 a 2 2 0 0 1 -2.83 0 L 2 12 V 2 h 10 l 8.59 8.59 a 2 2 0 0 1 0 2.82 z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

export const Percent = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <line x1="19" y1="5" x2="5" y2="19" />
    <circle cx="6.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </svg>
);

export const TrendingUp = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

export const TrendingDown = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </svg>
);

export const BarChart2 = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </svg>
);

export const DollarSign = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M 17 5 H 9.5 a 3.5 3.5 0 0 0 0 7 h 5 a 3.5 3.5 0 0 1 0 7 H 6" />
  </svg>
);

export const CreditCard = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);

export const Truck = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <rect x="1" y="3" width="15" height="13" rx="1" />
    <path d="M 16 8 h 4 l 3 5 v 3 h -7 V 8 z" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
);

export const RefreshCw = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 3 12 a 9 9 0 0 1 9 -9 a 9.75 9.75 0 0 1 6.74 2.74 L 21 8" />
    <path d="M 21 3 v 5 h -5" />
    <path d="M 21 12 a 9 9 0 0 1 -9 9 a 9.75 9.75 0 0 1 -6.74 -2.74 L 3 16" />
    <path d="M 8 16 H 3 v 5" />
  </svg>
);

export const RotateCcw = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 3 12 a 9 9 0 1 0 9 -9 a 9.75 9.75 0 0 0 -6.74 2.74 L 3 8" />
    <path d="M 3 3 v 5 h 5" />
  </svg>
);

export const Share2 = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

export const Bell = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 18 8 A 6 6 0 0 0 6 8 c 0 7 -3 9 -3 9 h 18 s -3 -2 -3 -9" />
    <path d="M 13.73 21 a 2 2 0 0 1 -3.46 0" />
  </svg>
);

export const Lock = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M 7 11 V 7 a 5 5 0 0 1 10 0 v 4" />
  </svg>
);

export const Unlock = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M 7 11 V 7 a 5 5 0 0 1 9.9 -1" />
  </svg>
);

export const LogOut = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 9 21 H 5 a 2 2 0 0 1 -2 -2 V 5 a 2 2 0 0 1 2 -2 h 4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export const LogIn = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <path d="M 15 3 h 4 a 2 2 0 0 1 2 2 v 14 a 2 2 0 0 1 -2 2 h -4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </svg>
);

export const Maximize2 = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

export const Minimize2 = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <polyline points="4 14 10 14 10 20" />
    <polyline points="20 10 14 10 14 4" />
    <line x1="10" y1="14" x2="3" y2="21" />
    <line x1="21" y1="3" x2="14" y2="10" />
  </svg>
);

export const ZoomIn = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

export const ZoomOut = ({ className, size = 24, ...props }) => (
  <svg {...iconBase(size, className, props)}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);