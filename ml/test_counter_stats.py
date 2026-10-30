import unittest
import numpy as np
from counter_stats import counter_counts

class CounterCountsTest(unittest.TestCase):
    def test_direction_and_team_swap(self):
        data={}
        for split in ['train','validation','test']:
            data.update({split+'_tier':np.array([],dtype=int),split+'_b':np.empty((0,6),dtype=int),split+'_map':np.array([],dtype=int),split+'_y':np.array([],dtype=int)})
        data.update(train_tier=np.array([0,1]),train_b=np.array([[5,0,2,1,3,4],[0,1,2,3,4,5]]),train_map=np.array([0,1]),train_y=np.array([1,0]))
        counts,wins,train=counter_counts(data,0,6,2)
        self.assertEqual(counts.sum(),9);self.assertEqual(train.sum(),9)
        self.assertEqual(counts[0,0,1],1);self.assertEqual(wins[0,0,1],1)
        self.assertEqual(counts[0,1,5],1);self.assertEqual(wins[0,1,5],0)
        self.assertEqual(counts[0,0,5],0);self.assertEqual(counts[1].sum(),0)
        data['train_b']=data['train_b'][:,[3,4,5,0,1,2]];data['train_y']=1-data['train_y']
        for expected,actual in zip((counts,wins,train),counter_counts(data,0,6,2)):np.testing.assert_array_equal(expected,actual)
        # Opposite outcomes complement canonical wins without changing pair counts.
        data['train_y']=1-data['train_y']
        reverse=counter_counts(data,0,6,2)
        np.testing.assert_array_equal(reverse[1],counts-wins)

if __name__ == '__main__': unittest.main()
