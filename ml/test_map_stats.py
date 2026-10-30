import unittest
import numpy as np
from map_stats import build_map_stats


class MapStatsTest(unittest.TestCase):
    def test_each_set_counts_both_teams_once_and_preserves_tier(self):
        data = {}
        for split in ['train', 'validation', 'test']:
            data.update({split+'_tier':np.array([],dtype=int),split+'_b':np.empty((0,6),dtype=int),
                         split+'_map':np.array([],dtype=int),split+'_y':np.array([],dtype=int)})
        data.update(train_tier=np.array([0,0,1]),train_b=np.array([[0,1,2,3,4,5]]*3),
                    train_map=np.array([0,0,0]),train_y=np.array([1,0,0]))
        audit = {'brawlers':[{'id':i} for i in range(6)],'maps':[{'name':'Test','mode':'bounty'}],
                 'regime':{'rankedSeasonId':50,'balancePatchId':'test','start':'20261015T090000.000Z','end':'20261119T090000.000Z'},
                 'split_ranges':{'train':['20261026T000000.000Z','20261026T010000.000Z']}}
        result=build_map_stats(data,audit,{'revision':'test'},'test')
        self.assertEqual(result['tiers']['Mythic']['maps'][0],{'sets':2,'appearances':[2]*6,'wins':[1]*6})
        self.assertEqual(result['tiers']['Legendary']['maps'][0],{'sets':1,'appearances':[1]*6,'wins':[0,0,0,1,1,1]})
        self.assertEqual(result['tiers']['Masters']['sets'],0)
        self.assertEqual(result['tiers']['Pro']['sets'],0)


if __name__=='__main__':unittest.main()
