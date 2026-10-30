import unittest
import numpy as np
import pandas as pd
from win_times import features, player_comparison, select_candidate, participant_frame

class WinTimesTest(unittest.TestCase):
    def test_team_swap_changes_feature_sign(self):
        b=np.array([[0,1,2,3,4,5]]);r=np.array([[13,14,15,16,17,18]])
        p=np.array([[0,1,2,3,4,5]]);known=np.arange(6);maps=np.array([0])
        c,x=features(b,r,maps,p,known,6,1)
        s=[3,4,5,0,1,2]
        cc,xx=features(b[:,s],r[:,s],maps,p[:,s],known,6,1)
        np.testing.assert_array_equal(x.toarray(),-xx.toarray())
        np.testing.assert_array_equal(c.toarray(),-cc.toarray())
        # Unknown players do not accidentally acquire the last known player's effect.
        known[:]=-1
        _,xx=features(b,r,maps,p,known,6,1)
        self.assertEqual(xx.shape,c.shape)

    def test_within_player_avoids_composition_confounding(self):
        rows=[]
        # Different player mix by hour creates a spurious pooled advantage;
        # each individual's outcome is unchanged, so our contrast must be zero.
        for player,win,inside,outside in [(0,1,20,5),(1,0,2,50)]:
            for window,n in [(0,inside),(1,outside)]:
                rows.extend([{'player':player,'y':win,'residual':win-.5,'window':window,'day':0}]*n)
        frame=pd.DataFrame(rows)
        stats,cohort=player_comparison(frame,0)
        self.assertEqual(stats['effect'],0)
        self.assertEqual(stats['players'],2)
        self.assertEqual(cohort,{0,1})
        self.assertGreater(frame[frame.window==0].y.mean(),frame[frame.window==1].y.mean())
        restricted,_=player_comparison(frame,0,{1})
        self.assertEqual(restricted['players'],1)
        self.assertEqual(restricted['winRate'],0)

    def test_candidate_selection_excludes_sparse_and_negative(self):
        base={'players':50,'inside':200,'days':3,'effect':.01}
        windows=[dict(base) for _ in range(8)]
        windows[1]['effect']=.2;windows[1]['players']=49
        windows[2]['effect']=.03
        windows[3]['effect']=-.7
        self.assertEqual(select_candidate(windows),2)
        self.assertIsNone(select_candidate([{**base,'effect':0}]*8))

    def test_frozen_membership_and_outcome_orientation(self):
        p=np.array([[0,1,2,3,4,5]])
        members=np.array([2,2,2,2,2,-1])
        f=participant_frame(p,np.array([1]),np.array([0.]),np.array([36000]),members,2)
        self.assertEqual(len(f),5)
        self.assertEqual(f.y.tolist(),[1,1,1,0,0])
        self.assertEqual(f.residual.tolist(),[.5,.5,.5,-.5,-.5])
        self.assertTrue((f.window==3).all())
        # Flipping later labels changes outcomes but not membership/eligibility.
        ff=participant_frame(p,np.array([0]),np.array([0.]),np.array([36000]),members,2)
        self.assertEqual(f.player.tolist(),ff.player.tolist())

if __name__=='__main__': unittest.main()
