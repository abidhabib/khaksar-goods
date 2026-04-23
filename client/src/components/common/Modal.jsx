import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      ></div>
      
      <div className={`relative bg-cargo-card border border-cargo-border rounded-xl shadow-2xl w-full ${sizeClasses[size]} max-h-[90vh] overflow-auto`}>
        <div className="flex items-center justify-between p-6 border-b border-cargo-border">
          <h3 className="text-lg font-semibold text-cargo-text">{title}</h3>
          <button 
            onClick={onClose}
            className="p-1 text-cargo-muted hover:text-cargo-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;