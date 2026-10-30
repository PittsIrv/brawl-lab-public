import unittest
import numpy as np
from combo_stats import pair_counts

class ComboCountsTest(unittest.TestCase):
    def test_pairs_are_allied_canonical_and_each_set_counts_six(self):
        data={}
        for split in ['train','validation','test']:
            data.update({split+'_tier':np.array([],dtype=int),split+'_b':np.empty((0,6),dtype=int),split+'_map':np.array([],dtype=int),split+'_y':np.array([],dtype=int)})
        data.update(train_tier=np.array([0,1]),train_b=np.array([[2,0,1,5,3,4],[0,1,2,3,4,5]]),train_map=np.array([0,1]),train_y=np.array([1,0]))
        counts,wins,train=pair_counts(data,0,6,2)
        self.assertEqual(counts.sum(),6);self.assertEqual(wins.sum(),3);self.assertEqual(train.sum(),6)
        self.assertEqual(counts[0,0,1],1);self.assertEqual(wins[0,0,1],1)
        self.assertEqual(counts[0,3,5],1);self.assertEqual(wins[0,3,5],0)
        self.assertEqual(counts[0,0,3],0);self.assertEqual(counts[1].sum(),0)
        # Team swap plus result reversal preserves all aggregate pair results.
        data['train_b']=data['train_b'][:,[3,4,5,0,1,2]];data['train_y']=1-data['train_y']
        for expected,actual in zip((counts,wins,train),pair_counts(data,0,6,2)):np.testing.assert_array_equal(expected,actual)

if __name__ == '__main__': unittest.main()
