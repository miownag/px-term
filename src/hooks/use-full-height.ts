import { useSyncExternalStore } from 'react';

const store = {
  subscribe: (onStoreChange: () => void) => {
    process.stdout.on('resize', onStoreChange);
    return () => process.stdout.off('resize', onStoreChange);
  },
  getRows: () => process.stdout.rows,
};

const useFullHeight = () =>
  useSyncExternalStore(store.subscribe, store.getRows);

export default useFullHeight;
