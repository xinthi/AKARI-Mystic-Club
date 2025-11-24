import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { CheckCircle } from 'lucide-react';

interface Question {
  id: string;
  type: 'rating' | 'multiple' | 'text';
  question: string;
  options?: string[];
  min?: number;
  max?: number;
}

interface Survey {
  id: string;
  title: string;
  description: string | null;
  questions: Question[];
}

export default function SurveyPage() {
  const router = useRouter();
  const { id } = router.query;
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
    fetch(`${apiUrl}/survey/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setSurvey(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching survey:', err);
        setLoading(false);
      });
  }, [id]);

  const handleSubmit = async () => {
    if (!survey || !id) return;

    // Get userId from Telegram Web App
    const userId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;

    if (!userId) {
      alert('User ID not found. Please open this survey from Telegram.');
      return;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
      const res = await fetch(`${apiUrl}/survey/${id}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userId.toString(),
          responses,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        alert('Error submitting survey');
      }
    } catch (err) {
      console.error('Error submitting survey:', err);
      alert('Error submitting survey');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-mystic flex items-center justify-center">
        <div className="text-white text-xl">Loading survey...</div>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="min-h-screen bg-gradient-mystic flex items-center justify-center">
        <div className="text-white text-xl">Survey not found</div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-mystic flex items-center justify-center">
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Thank you!</h2>
          <p className="text-gray-400">Your response has been submitted.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-mystic text-white p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">{survey.title}</h1>
        {survey.description && (
          <p className="text-gray-400 mb-8">{survey.description}</p>
        )}

        <div className="space-y-6">
          {survey.questions.map((question, index) => (
            <div key={question.id} className="bg-mystic-dark/50 rounded-lg p-6">
              <h3 className="font-semibold mb-4">
                {index + 1}. {question.question}
              </h3>

              {question.type === 'rating' && (
                <div>
                  <input
                    type="range"
                    min={question.min || 1}
                    max={question.max || 5}
                    value={responses[question.id] || question.min || 1}
                    onChange={(e) =>
                      setResponses({
                        ...responses,
                        [question.id]: parseInt(e.target.value, 10),
                      })
                    }
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-gray-400 mt-2">
                    <span>{question.min || 1}</span>
                    <span className="text-white font-semibold">
                      {responses[question.id] || question.min || 1}
                    </span>
                    <span>{question.max || 5}</span>
                  </div>
                </div>
              )}

              {question.type === 'multiple' && question.options && (
                <div className="space-y-2">
                  {question.options.map((option) => (
                    <label
                      key={option}
                      className="flex items-center gap-2 cursor-pointer hover:bg-mystic-dark/30 p-2 rounded"
                    >
                      <input
                        type="radio"
                        name={question.id}
                        value={option}
                        checked={responses[question.id] === option}
                        onChange={(e) =>
                          setResponses({
                            ...responses,
                            [question.id]: e.target.value,
                          })
                        }
                        className="w-4 h-4"
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              )}

              {question.type === 'text' && (
                <textarea
                  value={responses[question.id] || ''}
                  onChange={(e) =>
                    setResponses({
                      ...responses,
                      [question.id]: e.target.value,
                    })
                  }
                  className="w-full bg-mystic-dark rounded p-3 text-white"
                  rows={4}
                  placeholder="Your answer..."
                />
              )}
            </div>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          className="w-full mt-8 py-4 bg-mystic-purple rounded-lg font-semibold hover:bg-mystic-purple/80 transition"
        >
          Submit Survey
        </button>
      </div>
    </div>
  );
}

