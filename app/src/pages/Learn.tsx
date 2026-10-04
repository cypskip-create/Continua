import { ArrowLeft, BookOpen, Play, Coffee, Award, Clock, GraduationCap, Trophy, Target, CheckCircle2, Lock, Star, Video, FileText, Headphones, ChevronRight, Flame, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/shared/TopBar";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { navigateBack } from "@/lib/navigation";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

export default function Learn() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState("all");
  const [expandedCourse, setExpandedCourse] = useState<number | null>(null);

  const learningPaths = [
    {
      id: 1,
      title: "Beginner Investor",
      description: "Start your investing journey",
      courses: 5,
      duration: "8 hours",
      progress: 60,
      icon: Target,
      color: "from-green-500 to-emerald-600"
    },
    {
      id: 2,
      title: "Technical Analyst",
      description: "Master chart analysis",
      courses: 8,
      duration: "15 hours",
      progress: 25,
      icon: Zap,
      color: "from-blue-500 to-indigo-600"
    },
    {
      id: 3,
      title: "Portfolio Pro",
      description: "Advanced portfolio management",
      courses: 6,
      duration: "12 hours",
      progress: 0,
      icon: Trophy,
      color: "from-purple-500 to-pink-600"
    }
  ];

  const courses = [
    { 
      id: 1,
      title: "Stock Market Basics", 
      progress: 0, 
      lessons: 12, 
      duration: "2 hours",
      level: "Beginner",
      type: "video",
      icon: Play,
      rating: 4.8,
      students: 2540,
      instructor: "James Mwangi",
      description: "Learn the fundamentals of stock market investing",
      modules: [
        { title: "What is the Stock Market?", duration: "10 min", completed: false, type: "video" },
        { title: "Understanding Stock Prices", duration: "12 min", completed: false, type: "video" },
        { title: "Quiz: Market Basics", duration: "5 min", completed: false, type: "quiz" },
        { title: "How to Read Stock Charts", duration: "15 min", completed: false, type: "video" }
      ]
    },
    { 
      id: 2,
      title: "Technical Analysis Masterclass", 
      progress: 40, 
      lessons: 8, 
      duration: "3 hours",
      level: "Intermediate",
      type: "video",
      icon: Play,
      rating: 4.9,
      students: 1850,
      instructor: "Mary Wanjiru",
      description: "Master chart patterns and technical indicators",
      modules: [
        { title: "Candlestick Patterns", duration: "20 min", completed: true, type: "video" },
        { title: "Support & Resistance", duration: "18 min", completed: true, type: "video" },
        { title: "Moving Averages", duration: "22 min", completed: false, type: "video" },
        { title: "RSI & MACD", duration: "25 min", completed: false, type: "video" }
      ]
    },
    { 
      id: 3,
      title: "Portfolio Management", 
      progress: 100, 
      lessons: 10, 
      duration: "2.5 hours",
      level: "Advanced",
      type: "text",
      icon: BookOpen,
      rating: 4.7,
      students: 980,
      instructor: "David Omondi",
      description: "Build and manage a winning portfolio",
      modules: [
        { title: "Diversification Strategies", duration: "15 min", completed: true, type: "text" },
        { title: "Risk Assessment", duration: "20 min", completed: true, type: "text" },
        { title: "Rebalancing Techniques", duration: "18 min", completed: true, type: "video" }
      ]
    },
    { 
      id: 4,
      title: "Risk Management Strategies", 
      progress: 25, 
      lessons: 15, 
      duration: "4 hours",
      level: "Intermediate",
      type: "audio",
      icon: Headphones,
      rating: 4.6,
      students: 1420,
      instructor: "Grace Akinyi",
      description: "Protect your investments with proper risk management",
      modules: [
        { title: "Understanding Risk", duration: "12 min", completed: true, type: "audio" },
        { title: "Position Sizing", duration: "15 min", completed: false, type: "audio" },
        { title: "Stop Loss Strategies", duration: "18 min", completed: false, type: "video" }
      ]
    },
    { 
      id: 5,
      title: "NSE Trading Guide", 
      progress: 0, 
      lessons: 6, 
      duration: "1.5 hours",
      level: "Beginner",
      type: "video",
      icon: Play,
      rating: 4.9,
      students: 3200,
      instructor: "Peter Kamau",
      description: "Complete guide to trading on the Nairobi Securities Exchange",
      modules: [
        { title: "Opening a Trading Account", duration: "8 min", completed: false, type: "video" },
        { title: "Placing Your First Trade", duration: "12 min", completed: false, type: "video" },
        { title: "Understanding Fees", duration: "10 min", completed: false, type: "text" }
      ]
    },
    { 
      id: 6,
      title: "Dividend Investing", 
      progress: 0, 
      lessons: 8, 
      duration: "2 hours",
      level: "Intermediate",
      type: "video",
      icon: Play,
      rating: 4.8,
      students: 1680,
      instructor: "Sarah Njeri",
      description: "Build passive income through dividend stocks",
      modules: [
        { title: "What are Dividends?", duration: "10 min", completed: false, type: "video" },
        { title: "Dividend Yield Explained", duration: "12 min", completed: false, type: "video" },
        { title: "Building a Dividend Portfolio", duration: "20 min", completed: false, type: "video" }
      ]
    }
  ];

  const certificates = [
    { title: "Portfolio Management", date: "Dec 2024", badge: "gold" },
    { title: "Stock Market Basics", date: "Nov 2024", badge: "silver" }
  ];

  const dailyChallenge = {
    title: "Complete 2 lessons today",
    progress: 1,
    total: 2,
    xp: 50,
    streak: 7
  };

  const filteredCourses = activeCategory === "all" 
    ? courses 
    : courses.filter(c => c.level.toLowerCase() === activeCategory);

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'video': return <Video className="h-3 w-3" />;
      case 'text': return <FileText className="h-3 w-3" />;
      case 'audio': return <Headphones className="h-3 w-3" />;
      case 'quiz': return <Target className="h-3 w-3" />;
      default: return <Play className="h-3 w-3" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero pb-20">
      <TopBar 
        title="Learning Center" 
        subtitle="Master investing skills"
        showSearch={true}
        showNotifications={true}
      />

      <div className="p-4 space-y-5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigateBack(navigate, "/")}
          className="mb-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {/* Daily Challenge & Streak */}
        <Card className="bg-gradient-to-r from-accent/20 to-primary/20 border-accent/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-orange-500" />
                <span className="font-semibold text-sm">{dailyChallenge.streak} Day Streak!</span>
              </div>
              <Badge variant="secondary" className="text-xs">
                +{dailyChallenge.xp} XP
              </Badge>
            </div>
            <p className="text-sm mb-2">{dailyChallenge.title}</p>
            <Progress value={(dailyChallenge.progress / dailyChallenge.total) * 100} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">{dailyChallenge.progress}/{dailyChallenge.total} completed</p>
          </CardContent>
        </Card>

        {/* Learning Stats */}
        <div className="grid grid-cols-4 gap-2">
          <Card className="card-gradient">
            <CardContent className="p-3 text-center">
              <GraduationCap className="h-5 w-5 mx-auto mb-1 text-primary" />
              <div className="text-lg font-bold">6</div>
              <div className="text-[0.625rem] text-muted-foreground">Courses</div>
            </CardContent>
          </Card>
          <Card className="card-gradient">
            <CardContent className="p-3 text-center">
              <Clock className="h-5 w-5 mx-auto mb-1 text-accent" />
              <div className="text-lg font-bold">12h</div>
              <div className="text-[0.625rem] text-muted-foreground">Learned</div>
            </CardContent>
          </Card>
          <Card className="card-gradient">
            <CardContent className="p-3 text-center">
              <Trophy className="h-5 w-5 mx-auto mb-1 text-yellow-500" />
              <div className="text-lg font-bold">2</div>
              <div className="text-[0.625rem] text-muted-foreground">Certificates</div>
            </CardContent>
          </Card>
          <Card className="card-gradient">
            <CardContent className="p-3 text-center">
              <Star className="h-5 w-5 mx-auto mb-1 text-orange-500" />
              <div className="text-lg font-bold">850</div>
              <div className="text-[0.625rem] text-muted-foreground">XP Points</div>
            </CardContent>
          </Card>
        </div>

        {/* Learning Paths */}
        <div>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Learning Paths
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
            {learningPaths.map((path) => {
              const Icon = path.icon;
              return (
                <Card key={path.id} className={`min-w-[200px] bg-gradient-to-br ${path.color} text-white border-0`}>
                  <CardContent className="p-4">
                    <Icon className="h-6 w-6 mb-2" />
                    <h4 className="font-semibold text-sm">{path.title}</h4>
                    <p className="text-xs opacity-80 mb-2">{path.description}</p>
                    <div className="flex items-center justify-between text-xs opacity-80 mb-2">
                      <span>{path.courses} courses</span>
                      <span>{path.duration}</span>
                    </div>
                    <Progress value={path.progress} className="h-1.5 bg-white/30" />
                    <p className="text-xs mt-1">{path.progress}% complete</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Certificates */}
        {certificates.length > 0 && (
          <div>
            <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
              <Award className="h-4 w-4 text-yellow-500" />
              Your Certificates
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {certificates.map((cert, idx) => (
                <Card key={idx} className="min-w-[160px] card-gradient border-yellow-500/30">
                  <CardContent className="p-3 text-center">
                    <div className={`w-12 h-12 mx-auto mb-2 rounded-full flex items-center justify-center ${
                      cert.badge === 'gold' ? 'bg-yellow-500/20' : 'bg-gray-400/20'
                    }`}>
                      <Award className={`h-6 w-6 ${cert.badge === 'gold' ? 'text-yellow-500' : 'text-gray-400'}`} />
                    </div>
                    <p className="text-xs font-medium">{cert.title}</p>
                    <p className="text-[0.625rem] text-muted-foreground">{cert.date}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Course Tabs */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-10">
            <TabsTrigger value="all" className="text-xs" onClick={() => setActiveCategory("all")}>All</TabsTrigger>
            <TabsTrigger value="beginner" className="text-xs" onClick={() => setActiveCategory("beginner")}>Beginner</TabsTrigger>
            <TabsTrigger value="intermediate" className="text-xs" onClick={() => setActiveCategory("intermediate")}>Intermediate</TabsTrigger>
            <TabsTrigger value="advanced" className="text-xs" onClick={() => setActiveCategory("advanced")}>Advanced</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Courses List */}
        <div className="space-y-3">
          {filteredCourses.map((course) => {
            const Icon = course.icon;
            const isExpanded = expandedCourse === course.id;
            return (
              <Card key={course.id} className="card-gradient overflow-hidden">
                <CardContent className="p-0">
                  {/* Course Header */}
                  <div 
                    className="p-4 cursor-pointer"
                    onClick={() => setExpandedCourse(isExpanded ? null : course.id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-sm">{course.title}</h4>
                          {course.progress === 100 && (
                            <CheckCircle2 className="h-4 w-4 text-bull" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{course.description}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {course.level}
                          </Badge>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Icon className="h-3 w-3" />
                            <span>{course.type}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{course.duration}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-yellow-500">
                            <Star className="h-3 w-3 fill-current" />
                            <span>{course.rating}</span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className={`h-5 w-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </div>
                    
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-muted-foreground">{course.lessons} lessons • {course.students.toLocaleString()} students</span>
                      <span className="text-xs text-primary font-medium">{course.progress}%</span>
                    </div>
                    <Progress value={course.progress} className="h-1.5 mt-2" />
                  </div>

                  {/* Expanded Content - Modules */}
                  {isExpanded && (
                    <div className="border-t border-border bg-muted/20 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <img 
                          src={`https://api.dicebear.com/7.x/initials/svg?seed=${course.instructor}`}
                          alt={course.instructor}
                          className="w-8 h-8 rounded-full"
                        />
                        <div>
                          <p className="text-xs font-medium">{course.instructor}</p>
                          <p className="text-[0.625rem] text-muted-foreground">Instructor</p>
                        </div>
                      </div>
                      
                      <h5 className="text-xs font-semibold mb-2">Course Modules</h5>
                      <div className="space-y-2">
                        {course.modules.map((module, idx) => (
                          <div 
                            key={idx} 
                            className={`flex items-center justify-between p-2 rounded-lg ${
                              module.completed ? 'bg-bull/10' : 'bg-muted/30'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {module.completed ? (
                                <CheckCircle2 className="h-4 w-4 text-bull" />
                              ) : (
                                <div className="h-4 w-4 rounded-full border border-muted-foreground" />
                              )}
                              <div>
                                <p className="text-xs font-medium">{module.title}</p>
                                <div className="flex items-center gap-2 text-[0.625rem] text-muted-foreground">
                                  {getTypeIcon(module.type)}
                                  <span>{module.duration}</span>
                                </div>
                              </div>
                            </div>
                            <Button size="sm" variant={module.completed ? "ghost" : "default"} className="h-7 text-xs">
                              {module.completed ? "Review" : "Start"}
                            </Button>
                          </div>
                        ))}
                      </div>
                      
                      <Button className="w-full mt-4 btn-primary">
                        {course.progress === 0 ? "Start Course" : course.progress === 100 ? "Review Course" : "Continue Learning"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
