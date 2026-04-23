import { Loader2 } from 'lucide-react';

const Loading = ({ fullScreen = false }) => {
  if (fullScreen) {
    return (
      <div className="min-h-screen bg-cargo-dark flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
    </div>
  );
};

export default Loading;