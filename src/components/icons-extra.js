// Additional SVG icons not in the main icons.js file
export const ZoomIn = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    <line x1="11" y1="8" x2="11" y2="14"/>
    <line x1="8" y1="11" x2="14" y2="11"/>
  </svg>
);

export const Link = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M10 13a5 5 0 0 0 7.54 7.54l3 3 3 3a5 5 0 0 0 7.07-7.07l-3-3a5 5 0 0 0-7.07 7.07z"/>
    <path d="M14 11.05V9a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v2a5 5 0 0 0 5 5h6a5 5 0 0 0 5-5v2a5 5 0 0 0-5-5z"/>
  </svg>
);

export const User = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v12a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4z"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

export const Edit = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2-2H4"/>
    <path d="m18.5 8.5 2.121 2.121 4.243 4.243L12 15l-6.5-6.5"/>
  </svg>
);

export const Filter = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polygon points="22,3 2,3 2,17 12,17 12,22 22,22"/>
    <path d="M16,17L4,4"/>
  </svg>
);

export const Calendar = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

export const Eye = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-4 4-11 8-11 8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

export const AlertCircle = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12" y2="12"/>
  </svg>
);

export const CheckCircle = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M22 11.08V12a10 10 0 0 0-20 0H4a10 10 0 0 0-20 0v1a10 10 0 0 0 20 0h12a10 10 0 0 0 20-0v-1a10 10 0 0 0-20 0z"/>
    <path d="m15.71 11.34-1.42-1.41"/>
    <path d="M12 20.59a9 9 0 0 0 9-9"/>
  </svg>
);

export const Settings = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 1v6"/>
    <path d="M12 17v6"/>
    <path d="M19.07 4.93a10 10 0 0 1-14.14 14.14V20"/>
    <path d="M5 4.93a10 10 0 0 1 14.14 14.14V8"/>
  </svg>
);

export const Tag = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
    <line x1="7" y1="7" x2="7.01" y2="7"/>
  </svg>
);

export const Shield = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M12 22s8-4 11-4 11 8 11-4 4 4 4 4 4 0 0 4-4 4H5a4 4 0 0 0-4-4v-1a9 9 0 0 1 18 9v1a9 9 0 0 1-18-9z"/>
    <path d="M20.84 4.61a5.5 5.5 0 0 1-3.58-3.58L12 7.41l-3.58 3.58A5.5 5.5 0 0 1 3.58 3.58L20.84 19.39a5.5 5.5 0 0 0-3.58-3.58Z"/>
  </svg>
);

export const ArrowLeft = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polyline points="19 12 5 12 9 6"/>
  </svg>
);

export const LayoutDashboard = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <line x1="9" y1="3" x2="9" y2="21"/>
    <line x1="15" y1="3" x2="15" y2="7"/>
    <line x1="15" y1="12" x2="15" y2="3"/>
    <line x1="9" y1="12" x2="15" y2="12"/>
    <line x1="9" y1="21" x2="15" y2="21"/>
    <line x1="9" y1="7" x2="9" y2="3"/>
  </svg>
);

export const Loader2 = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={`animate-spin ${className}`}
    {...props}
  >
    <path d="M21 12a9 9 0 11-6.219-8.56"/>
  </svg>
);

export const Minus = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

export const Edit2 = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

export const ExternalLink = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/>
    <line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);

export const Save = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/>
    <polyline points="7 3 7 8 15 8"/>
  </svg>
);

export const ImageIcon = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
);

export const CheckSquare = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polyline points="9 11 12 14 22 4"/>
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
  </svg>
);

export const Square = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
  </svg>
);

export const FolderTree = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M22 19V9a2 2 0 0 0-2-2h-6a2 2 0 0 1-2-2V3a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z"/>
    <polyline points="10 13 16 13 16 17"/>
    <polyline points="10 17 14 17"/>
  </svg>
);

export const Package = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <line x1="12.5" y1="2.5" x2="12.5" y2="9.5"/>
    <polyline points="16 2 8 2 6 8.5 18 8.5 16 2"/>
    <path d="M6 8.5L6 21a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8.5"/>
  </svg>
);

export const Truck = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <rect x="1" y="3" width="15" height="13"/>
    <polygon points="16,8 20,8 23,11 23,16 16,16"/>
    <circle cx="5.5" cy="18.5" r="2.5"/>
    <circle cx="18.5" cy="18.5" r="2.5"/>
  </svg>
);

export const Users = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

export const Target = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="6"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
);

export const Mail = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="m22 7-10 5L12 14l-10-7"/>
  </svg>
);

export const Download = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

export const Crown = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
);

export const UserMinus = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="8.5" cy="7" r="4"/>
    <line x1="20" y1="8" x2="14" y2="8"/>
  </svg>
);

export const Monitor = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
    <line x1="8" y1="21" x2="16" y2="21"/>
    <line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
);

export const Archive = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <rect x="3" y="4" width="18" height="20" rx="2" ry="2"/>
    <line x1="5" y1="9" x2="19" y2="9"/>
    <line x1="9" y1="21" x2="15" y2="21"/>
  </svg>
);

export const Layers = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polygon points="12,2 2,7 12,12 22,7 12,2"/>
    <polyline points="2 17 12 22 22 17"/>
    <polyline points="2 12 12 17 22 12"/>
  </svg>
);

export const AlertTriangle = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

export const LinkIcon = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);

export const Database = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
  </svg>
);

export const Layout = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <line x1="3" y1="9" x2="21" y2="9"/>
    <line x1="9" y1="21" x2="9" y2="9"/>
  </svg>
);

export const MonitorSmartphone = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
    <line x1="12" y1="18" x2="12.01" y2="18"/>
  </svg>
);

export const ChevronUp = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polyline points="18 15 12 9 6 15"/>
  </svg>
);

export const CornerDownLeft = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polyline points="9 14 4 19 4 19"/>
    <path d="M20 4v10a2 2 0 0 1-2 2H6"/>
  </svg>
);

export const ShoppingCart = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <circle cx="9" cy="21" r="1"/>
    <circle cx="20" cy="21" r="1"/>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
  </svg>
);

export const Trash2 = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19,6V14A2,2 0 0,1 17,16H7A2,2 0 0,1 5,14V6M8,6V4A2,2 0 0,1 10,2H14A2,2 0 0,1 16,4V6"/>
    <line x1="10" y1="11" x2="10" y2="17"/>
    <line x1="14" y1="11" x2="14" y2="17"/>
  </svg>
);

export const Search = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <circle cx="11" cy="11" r="8"/>
    <path d="m21 21-4.35-4.35"/>
  </svg>
);

export const X = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

export const ArrowRight = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="12 5 19 12 12 19"/>
  </svg>
);

export const Phone = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2H6.89a2 2 0 0 1-2.18 2v3"/>
    <path d="M15 13a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3"/>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2H6.89a2 2 0 0 1-2.18 2v3"/>
  </svg>
);

export const MapPin = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M21 10c0 7-9 13-9 13s9-6 9-13-9-13-9-13z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
);

export const ShoppingBag = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <path d="M16 10a4 4 0 0 1-8 0"/>
  </svg>
);

export const ChevronRight = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

export const ChevronLeft = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

export const ChevronDown = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

export const Menu = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <line x1="4" y1="12" x2="20" y2="12"/>
    <line x1="4" y1="6" x2="20" y2="6"/>
    <line x1="4" y1="18" x2="20" y2="18"/>
  </svg>
);

export const TrendingUp = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polyline points="23,6 13.5,6 11,6"/>
    <polyline points="17,20 17,14 13.5,14"/>
    <polyline points="13.5,14 10,20 10,14"/>
  </svg>
);

export const Activity = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polyline points="22,12 18,12 15,12"/>
    <polyline points="22,6 18,6 15,6"/>
    <polyline points="22,18 16,20.5 11,20.5"/>
    <polyline points="22,12 18,9 13,9"/>
  </svg>
);

export const Printer = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polyline points="6,9 6,11 6,16"/>
    <polyline points="6,18 6,21 18,21"/>
    <line x1="6" y1="14" x2="18" y2="14"/>
    <line x1="10" y1="14" x2="18" y2="14"/>
    <polyline points="18,8 22,8 22,16"/>
  </svg>
);

export const PackageSearch = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M21 21l-6-6m2-5a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7v-1"/>
    <path d="M3 16v3a7 7 0 0 0 7 7h4"/>
  </svg>
);

export const Box = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M21 8.5a0.5.5 0 0 0-.5-.5H21"/>
    <path d="M16 8.5a0.5.5 0 0 0-.5-.5H16"/>
    <path d="M12.25 8.5a0.5.5 0 0 0-.5-.5H12.25"/>
    <path d="M8.25 8.5a0.5.5 0 0 0-.5-.5H8.25"/>
    <path d="M4.75 8.5a0.5.5 0 0 0-.5-.5H4.75"/>
    <path d="M21 12v1.5"/>
    <path d="M16 12v1.5"/>
    <path d="M12.25 12v1.5"/>
    <path d="M8.25 12v1.5"/>
    <path d="M4.75 12v1.5"/>
  </svg>
);

export const CheckCircle2 = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M22 11.08V12a10 10 0 0 0-20 0H4a10 10 0 0 0-20 0v1a10 10 0 0 0 20 0h12a10 10 0 0 0 20-0v-1a10 10 0 0 0-20 0z"/>
    <path d="m15.71 11.34-1.42-1.41"/>
    <path d="M12 20.59a9 9 0 0 0 9-9"/>
  </svg>
);

export const Globe = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a10 10 0 0 1 10 10v2a10 10 0 0 1-10 10"/>
    <path d="m12 22-3-3"/>
  </svg>
);

export const ListFilter = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M22 3H2a8 8 0 0 0-8 8v18a8 8 0 0 0 8 8h4a8 8 0 0 0 8-8v-1"/>
    <path d="M22 3h-4"/>
  </svg>
);

export const Paintbrush = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="m18.37 2.63 1.88-1.88a5 5 0 0 1 3.59 3.59"/>
    <path d="M12 20.97a8 8 0 0 0-8 8"/>
    <path d="m9 13 1.42-1.42"/>
    <path d="m16 21 1.42-1.42"/>
    <path d="M21 11a9 9 0 0 1-9 9"/>
  </svg>
);

export const Upload = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17,8 12,3 7,8"/>
    <line x1="12" y1="3" x2="12" y2="8"/>
  </svg>
);

export const MessageSquare = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M21 15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

export const CreditCard = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
    <line x1="1" y1="10" x2="7" y2="10"/>
    <line x1="17" y1="10" x2="23" y2="10"/>
  </svg>
);

export const Share2 = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.41" x2="15.42" y2="17"/>
    <line x1="15.41" y1="17" x2="10.59" y2="19.59"/>
  </svg>
);

export const ShieldCheck = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M12 22s8-2 0-8-2v-4a8 8 0 0 0 8 8v4"/>
    <path d="m12 18-2-2"/>
    <path d="M22 12s-4 0-8-4v-2a8 8 0 0 0 8 8v2"/>
    <path d="M7 12a5 5 0 1 0-1h3a5 5 0 0 1 0v1a5 5 0 0 1-5 5"/>
    <path d="M5 12v-5a5 5 0 0 0 5 5v5a5 5 0 0 0 5 5"/>
  </svg>
);

export const Store = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M6 2L3 6v17a2 2 0 0 0 2-2h3"/>
    <path d="M8 6a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V6"/>
    <path d="M19 6h-4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V6"/>
  </svg>
);

export const RefreshCw = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polyline points="23,4 23,10 17,10 10,4"/>
    <polyline points="1,20 1,14 6,14 6,20"/>
    <polyline points="3.51,9 3,15 7,17 13,17 21,9"/>
  </svg>
);

export const Scale = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M16 21l-4-4"/>
    <path d="M3 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3"/>
    <path d="M5 12H3"/>
    <line x1="9" y1="12" x2="15" y2="12"/>
    <line x1="20" y1="9" x2="20" y2="3"/>
  </svg>
);

export const Code2 = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polyline points="16,18 12,22 8,22"/>
    <polyline points="3,6 3,18 10.5,12"/>
    <polyline points="20,6 20,18 13.5,12"/>
    <line x1="9" y1="12" x2="15" y2="12"/>
  </svg>
);

export const Banknote = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <line x1="9" y1="7" x2="15" y2="7"/>
    <line x1="9" y1="17" x2="15" y2="17"/>
    <path d="M21 7v10a2 2 0 0 1-2-2H3a2 2 0 0 1-2 2v10"/>
  </svg>
);

export const Smartphone = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
    <line x1="12" y1="18" x2="12.01" y2="18"/>
  </svg>
);

export const Lock = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1-5-5h4a5 5 0 0 1 5 5v2"/>
    <circle cx="12" cy="16" r="1"/>
  </svg>
);

export const RefreshCcw = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polyline points="23,4 12,4 5,16"/>
    <polyline points="23,4 16,12 18,12"/>
    <polyline points="5,20 9,14 14,20"/>
    <polyline points="5,6 4,6 14,6"/>
  </svg>
);

export const Plus = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

export const PlusCircle = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="16"/>
    <line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
);

export const Star = ({ className, size = 24, fill = false, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill={fill ? "currentColor" : "none"} 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polygon points="12,2 15.09,9.22 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,9.22"/>
  </svg>
);

export const Info = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="16" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>
);

export const Heart = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 7.78 1.73-4.91L12 2l-4.91 4.91a5.5 5.5 0 0 0 7.78 7.78 1.73 4.91L2 18.65l4.91 4.91A5.5 5.5 0 0 0 7.78 7.78L20.84 19.39a5.5 5.5 0 0 0-7.78-7.78Z"/>
    <line x1="12" y1="2" x2="12" y2="9"/>
  </svg>
);

export const ThumbsUp = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M7 10v12"/>
    <path d="M15.54 8.46a5 5 0 0 1-1.42-1.42L13 11.59V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8.41a5 5 0 0 1 1.42 1.42L11 12.41V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2z"/>
  </svg>
);

export const Check = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polyline points="20,6 9,17 4,12"/>
  </svg>
);

export const RotateCcw = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <polyline points="1,4 1,10 7,10"/>
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
  </svg>
);

export const Palette = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <circle cx="13.5" cy="6.5" r=".5"/>
    <circle cx="17.5" cy="10.5" r=".5"/>
    <circle cx="8.5" cy="7.5" r=".5"/>
    <circle cx="6.5" cy="12.5" r=".5"/>
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.8-.1 2.6-.4l.6.4c.8.6 1.9.7 2.7.2l1.4-.9c.7-.5.9-1.4.5-2.1l-.5-.8c.2-.8.3-1.6.3-2.5z"/>
  </svg>
);

export const FileText = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2Z"/>
    <polyline points="14,2 14,8 20,8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10,9 9,9 8,9"/>
  </svg>
);

export const LogOut = ({ className, size = 24, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={2}
    className={className}
    {...props}
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16,17 21,12 16,7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);
